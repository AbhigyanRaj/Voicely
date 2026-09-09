import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import DeepgramService from '../services/deepgramService.js';
import Call from '../models/Call.js';
import StreamingCallHandler from '../services/streamingCallHandler.js';
import { createTTS } from '../services/ttsFactory.js';
import { evaluateApplication, performDeepAnalysis } from '../config/gemini.js';
import { broadcastTranscriptUpdate, cleanupCallClients } from '../websocket/liveCallServer.js';
import { record } from '../utils/latencyMetrics.js';
import logger from '../utils/logger.js';

// Store active streaming sessions
const activeSessions = new Map();

// Cartesia "Kendra": the default sandbox voice.
const DEFAULT_VOICE_ID = '79a125e8-cd45-4c13-8a67-188112f4dd22';

// How long to wait after an interim-final segment before treating the turn as
// over. Only used when Deepgram has *not* set speech_final; when it has, its own
// endpointer already made the call and we act immediately.
const TURN_DEBOUNCE_MS = 120;



/**
 * Handle call completion data extraction
 */
const handleCallCompletion = async (callSid, sessionData) => {
  if (sessionData.hasCompleted) return;
  sessionData.hasCompleted = true; // Prevent double execution

  try {
    const call = await Call.findOne({ twilioCallSid: callSid });
    if (!call || !sessionData.callHandler) return;

    let module;
    if (call.demoAgentId) {
      const { getDemoAgentModule } = await import('../config/demoAgents.js');
      const demoModule = getDemoAgentModule(call.demoAgentId);
      if (!demoModule) return;
      module = {
        name: demoModule.name,
        type: 'custom',
        systemPrompt: demoModule.systemPrompt,
        questions: demoModule.questions || []
      };
    } else {
      module = await import('../models/Module.js').then(m => m.default.findById(call.moduleId));
      if (!module) return;
    }

    logger.info(`Extracting JSON answers for call ${callSid}...`);
    // Extract questions array
    const questionsList = module.questions.sort((a, b) => a.order - b.order).map(q => q.question);

    // The workspace lookup does not depend on the analysis, so overlap them
    // rather than paying a database round trip before the first LLM call.
    const [workspace, deepAnalysis] = await Promise.all([
      import('../models/Workspace.js').then(m => m.default.findById(call.workspaceId)),
      performDeepAnalysis(
        sessionData.callHandler.chatHistory,
        module.type || 'custom',
        call.customerName,
        module.systemPrompt || 'General Business Inquiry',
        questionsList
      )
    ]);
    const category = workspace?.category || 'startup';

    // evaluateApplication consumes deepAnalysis.extractedData, so this one has
    // to follow rather than run alongside.
    // Evaluate application based on category with full transcript context
    const evaluationStatus = await evaluateApplication(
      module.type || 'custom',
      deepAnalysis.extractedData,
      category,
      sessionData.callHandler.chatHistory
    );

    logger.info(`Deep Analysis complete for call ${callSid}: ${deepAnalysis.sentiment} sentiment, Eval: ${evaluationStatus}`);

    // Update DB - Fix: Use nested evaluation structure per Call.js schema
    call.evaluation = {
      result: evaluationStatus,
      timestamp: new Date(),
      analysis: {
        sentiment: deepAnalysis.sentiment,
        objections: deepAnalysis.objections,
        intentTier: deepAnalysis.intentTier,
        extractedData: deepAnalysis.extractedData,
        competitorMentioned: deepAnalysis.competitorMentioned,
      },
      stageAnalysis: {
        totalQuestions: questionsList.length,
        questionsReached: deepAnalysis.stageAnalysis?.questionsReached,
        dropOffPoint: deepAnalysis.stageAnalysis?.dropOffPoint,
      }
    };
    
    call.responses = deepAnalysis.extractedData;
    call.summary = deepAnalysis.summary;
    call.status = 'completed';
    call.duration = Math.floor((Date.now() - call.createdAt.getTime()) / 1000);
    call.transcription = sessionData.callHandler.chatHistory;

    await call.save();
    logger.success(`Call ${callSid} analytics saved successfully. Questions: ${deepAnalysis.stageAnalysis?.questionsReached ?? '?'}/${questionsList.length}`);



  } catch (err) {
    logger.error(`Error in handleCallCompletion for ${callSid}:`, err);
  } finally {
    // Releases the /live-call subscribers and, crucially, deletes this call's
    // entry from the in-memory `callStates` map. That map is only ever pruned
    // here, and this call site was lost when lead-sync was removed -- so every
    // session leaked its full transcript history for the lifetime of the process.
    // In `finally` because the analysis above can throw.
    try {
      if (sessionData?.callId) cleanupCallClients(sessionData.callId);
    } catch (cleanupErr) {
      logger.error('Error cleaning up live-call clients', cleanupErr);
    }
  }
};

/**
 * Handle Twilio Media Streams WebSocket connection
 * This endpoint receives real-time audio from Twilio and forwards to Deepgram
 */
let mediaStreamWss = null;

export function setupMediaStreamWebSocket(server = null) {
  if (mediaStreamWss) return mediaStreamWss;

  mediaStreamWss = new WebSocketServer({
    noServer: true
  });

  mediaStreamWss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    // Authenticate browser sandbox requests (optional for demo agents)
    if (url.pathname === '/api/streams/browser') {
      const token = url.searchParams.get('token');
      if (token && token !== 'null') {
        try {
          jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
          logger.warn('Browser sandbox connection rejected: Invalid token');
          ws.close(1008, 'Unauthorized: Invalid token');
          return;
        }
      }
    }

    logger.info(`New Twilio Media Stream connection initiated from ${req.socket.remoteAddress}`);

    let streamSid = null;
    let callSid = null;
    let deepgramService = null;
    // Only what is actually read downstream. `partialTranscripts` used to
    // accumulate every interim result for the life of the session and was never
    // read; `finalTranscripts`, `currentUtterance` and `lastTranscriptTime` were
    // written and never read at all.
    let sessionData = {
      silenceTimeout: null,
      // Turn timing, the anchor for turn.mouth_to_ear.
      turnStartedAt: null,
      firstAudioSent: false,
      lastPartialAt: null,
      // Coalesced AI text for the transcript sidechannel.
      aiPartialText: '',
      aiPartialTimer: null
    };
    const connectedAt = performance.now();

    ws.on('message', async (message, isBinary) => {
      try {
        // Browser sandbox clients send raw PCM frames as binary. Twilio's
        // protocol wraps audio in base64 inside JSON, which costs 36% more
        // bytes plus a JSON.parse per frame; the browser is not Twilio, so it
        // uses the cheap path and only control events stay JSON.
        //
        // Note `isBinary` rather than Buffer.isBuffer: ws hands text frames over
        // as Buffers too, so testing the type would swallow the JSON control
        // messages as if they were audio.
        if (isBinary) {
          if (message.length > 0 && deepgramService) deepgramService.sendAudio(message);
          return;
        }

        const messageString = message.toString();
        const msg = JSON.parse(messageString);
        
        if (msg.event !== 'media') {
            logger.info(`WebSocket received event: ${msg.event}`);
            logger.debug(`Raw message: ${messageString}`);
        }

        switch (msg.event) {
          case 'start':
            streamSid = msg.start.streamSid;
            callSid = msg.start.callSid;

            logger.info(`Media Stream Started [CallSid: ${callSid}] [StreamSid: ${streamSid}]`);

            try {
              // The browser sandbox creates the Call row synchronously before it
              // opens this socket, and Twilio only streams after our webhook
              // responded, so by the time `start` arrives the row exists. The old
              // 5x500ms retry loop spent up to 2.5s of every cold start waiting
              // for a race that cannot happen. One short retry covers replica lag.
              let call = await Call.findOne({ twilioCallSid: callSid });
              if (!call) {
                await new Promise((resolve) => setTimeout(resolve, 250));
                call = await Call.findOne({ twilioCallSid: callSid });
              }

              if (call) {
                // Sessions run on the server's own provider keys.
                const llmApiKey = null;
                const ttsApiKey = null;
                const sttApiKey = null;
                const isBrowserSandbox = true;

                // Open the STT socket. Deepgram's handshake is ~900ms from
                // here, so it is started now and awaited just before `ready`,
                // overlapping the handler and TTS setup below rather than
                // running strictly after them.

                deepgramService = new DeepgramService(sttApiKey);

                // Wire format is declared by the client, not inferred from the
                // path. The current sandbox client sends raw linear16 at its
                // AudioContext rate and says so via ?sampleRate=; anything that
                // does not declare a rate (Twilio, or an older cached bundle
                // still posting base64 mulaw) keeps the 8 kHz mulaw contract.
                const declaredRate = Number(url.searchParams.get('sampleRate'));
                const isLinearClient =
                  isBrowserSandbox && Number.isFinite(declaredRate) && declaredRate > 0;

                const connectionConfig = {
                  language: 'en-US',
                  model: process.env.DEEPGRAM_MODEL || 'nova-2-phonecall',
                  smart_format: true,
                  interim_results: true,
                  // 150ms rather than 300ms, with no_delay so Deepgram stops
                  // padding before it finalizes. The application-level debounce
                  // is a second endpointer stacked on this one, so the pair was
                  // costing well over half a second per turn.
                  endpointing: 150,
                  no_delay: true,
                  utterance_end_ms: '1000',
                  encoding: isLinearClient ? 'linear16' : 'mulaw',
                  sample_rate: isLinearClient ? declaredRate : 8000,
                  channels: 1,
                  punctuate: true,
                  keywords: ['yes:2', 'no:2', 'maybe:2', 'sure:2', 'okay:2', 'interested:2', 'not interested:2']
                };

                // Deepgram's handshake is ~900ms from here, so the connection is
                // started now and awaited once every handler is attached, which
                // overlaps it with the handler and TTS setup below.
                //
                // createLiveConnection also genuinely waits for the socket to
                // open: it used to return the instant listen.live() was called, so
                // `ready` went out while the socket was still connecting and every
                // frame sent in that window was silently dropped -- the user's
                // first word vanished, they repeated themselves, and it read as
                // latency.
                const deepgramReady = deepgramService.createLiveConnection(connectionConfig);

                logger.success(`Call record found: ${call._id}. Initializing handlers...`);
                const callHandler = new StreamingCallHandler(callSid, call.moduleId, call.phoneNumber, call.customerName, llmApiKey);
                // Hand over the document we already have. initialize() used to
                // re-query the very same Call, making this the third fetch of one
                // row in a single cold start.
                await callHandler.initialize(call);
                
                sessionData.callHandler = callHandler;
                // cleanupCallClients is keyed by the Mongo id, not the session sid.
                sessionData.callId = call._id.toString();

                // Initialize TTS based on explicit provider preference
                const optimizeFor = call.optimizeFor || 'latency';
                // Wideband for anything played through a browser. This used to
                // also require optimizeFor === 'quality', but the sandbox UI has
                // no control that sets it, so the whole 24 kHz path was dead code
                // and the demo ran on 8 kHz telephony audio.
                const isHighFidelity = isBrowserSandbox;
                
                // Cartesia is the only TTS provider, over its streaming
                // WebSocket where available. Opening that socket costs ~200ms, so
                // it is started here and awaited alongside Deepgram's handshake
                // rather than in series with it.
                const ttsPromise = createTTS({
                    voiceId: call.selectedVoice || DEFAULT_VOICE_ID,
                    isWebCall: isHighFidelity,
                    optimizeFor,
                    apiKey: ttsApiKey
                });
                const { tts, transport: ttsTransport } = await ttsPromise;
                sessionData.tts = tts;

                // A socket that drops mid-session would otherwise go silent.
                if (typeof tts.on === 'function') {
                    tts.on('transportClosed', () =>
                        logger.warn(`TTS transport closed for ${callSid}`));
                }

                logger.info(`TTS Initialized: [Voice: ${call.selectedVoice || DEFAULT_VOICE_ID}] [Cartesia/${ttsTransport}]`);

                // Set up TTS audio output handler
                tts.on('audio', (audioData) => {
                  if (ws.readyState === ws.OPEN && streamSid) {
                    let payload = audioData;
                    let encoding = 'mulaw';
                    let sampleRate = 8000;
                    
                    if (typeof audioData === 'object' && audioData.payload) {
                        payload = audioData.payload;
                        encoding = audioData.encoding || 'mulaw';
                        sampleRate = audioData.sampleRate || 8000;
                    }

                    // The headline number: the user stopped speaking, and this is
                    // the first audio of the reply reaching the wire. Recorded once
                    // per turn; barge-in resets the flag so the next turn measures
                    // cleanly.
                    if (!sessionData.firstAudioSent && sessionData.turnStartedAt !== null) {
                      sessionData.firstAudioSent = true;
                      record('turn.mouth_to_ear', performance.now() - sessionData.turnStartedAt);
                    }

                    ws.send(JSON.stringify({
                      event: 'media',
                      streamSid: streamSid,
                      media: { payload: payload, encoding, sampleRate }
                    }));
                  }
                });

                // Coalesce the AI transcript sidechannel. This used to fire once
                // per LLM token: a JSON.stringify plus a send on a second socket
                // for every token, competing with the audio socket for the same
                // event loop. It also sent each token on its own, and the client
                // replaces rather than appends its partial, so the UI flickered
                // through single tokens instead of showing the sentence so far.
                const flushAiPartial = () => {
                  sessionData.aiPartialTimer = null;
                  if (!sessionData.aiPartialText) return;
                  broadcastTranscriptUpdate(call._id.toString(), {
                    source: 'ai',
                    text: sessionData.aiPartialText,
                    isFinal: false
                  });
                };

                // Set up AI Event Handlers
                callHandler.on('aiResponseChunk', (text) => {
                  tts.processTextChunk(text);
                  sessionData.aiPartialText += text;
                  if (!sessionData.aiPartialTimer) {
                    sessionData.aiPartialTimer = setTimeout(flushAiPartial, 120);
                  }
                });

                callHandler.on('aiResponseComplete', (fullText) => {
                  tts.flush();
                  if (sessionData.aiPartialTimer) {
                    clearTimeout(sessionData.aiPartialTimer);
                    sessionData.aiPartialTimer = null;
                  }
                  sessionData.aiPartialText = '';
                  broadcastTranscriptUpdate(call._id.toString(), { source: 'ai', text: fullText, isFinal: true });
                });

                callHandler.on('callEnded', () => {
                  if (ws.readyState === ws.OPEN) {
                     ws.send(JSON.stringify({ event: 'end' }));
                  }
                });


                // Initialize buffered transcript array
                sessionData.bufferedTranscript = [];

                // Handle Deepgram transcripts
                deepgramService.on('partialTranscript', async (data) => {
                  try {
                    sessionData.lastPartialAt = performance.now();

                    // Barge-in logic
                    if (data.text.trim().length > 1) {
                      if (sessionData.callHandler && sessionData.callHandler.isGreeting) {
                        logger.debug(`Ignoring barge-in during initial greeting sequence: "${data.text.trim()}"`);
                      } else {
                        logger.info(`Barge-in detected: "${data.text.trim()}"`);
                        if (ws.readyState === ws.OPEN) {
                          ws.send(JSON.stringify({ event: 'clear', streamSid }));
                        }
                        if (sessionData.tts) {
                          if (typeof sessionData.tts.clear === 'function') {
                            sessionData.tts.clear();
                          } else {
                            sessionData.tts.audioQueue = []; 
                            sessionData.tts.textBuffer = '';
                          }
                        }
                        if (sessionData.callHandler) {
                          sessionData.callHandler.state = 'IDLE';
                          // The interrupted turn's speculation answers a question
                          // the user abandoned mid-sentence.
                          sessionData.callHandler._abortSpeculation();
                        }
                        
                        // Clear debouncer state to avoid cross-talk processing
                        sessionData.bufferedTranscript = [];
                        if (sessionData.silenceTimeout) {
                          clearTimeout(sessionData.silenceTimeout);
                          sessionData.silenceTimeout = null;
                        }
                        // The interrupted turn's timing is meaningless; let the
                        // next one measure from its own start.
                        sessionData.turnStartedAt = null;
                        sessionData.firstAudioSent = false;
                        if (sessionData.aiPartialTimer) {
                          clearTimeout(sessionData.aiPartialTimer);
                          sessionData.aiPartialTimer = null;
                        }
                        sessionData.aiPartialText = '';
                      }
                    }

                    if (sessionData.callHandler) {
                      // Start generating a reply now, against the interim text.
                      // Deepgram spends roughly 460ms deciding the speaker has
                      // stopped; this puts the LLM to work inside that window.
                      // Nothing is spoken unless the final transcript confirms it.
                      sessionData.callHandler.speculate(data.text, data.confidence);
                      broadcastTranscriptUpdate(call._id.toString(), { source: 'user', text: data.text, isFinal: false });
                    }
                  } catch (err) {
                    logger.error('Error handling partial transcript', err);
                  }
                });

                deepgramService.on('finalTranscript', async (data) => {
                  const cleanedText = data.text?.trim();
                  if (!cleanedText) return;

                  logger.debug(`Stream Segment Received: "${cleanedText}" (${(data.confidence * 100).toFixed(0)}%)`);
                  sessionData.bufferedTranscript.push(data);
                  if (sessionData.lastPartialAt !== null) {
                    // Gap between the last interim result and this final. This
                    // spans the tail of the user's speech plus Deepgram's
                    // endpointing decision, so it is legitimately larger than
                    // turn.mouth_to_ear -- it is not a stage we control. Named
                    // for what it measures; it used to be called stt.finalize,
                    // which read as though it were our own latency.
                    record('stt.last_partial_to_final', performance.now() - sessionData.lastPartialAt);
                    sessionData.lastPartialAt = null;
                  }

                  if (sessionData.silenceTimeout) {
                    clearTimeout(sessionData.silenceTimeout);
                    sessionData.silenceTimeout = null;
                  }

                  // Deepgram sets speech_final when its own endpointer has
                  // decided the speaker is done. When we have that, waiting out
                  // a debounce on top adds delay for no information: the whole
                  // point of the debounce is to bridge segments that arrive
                  // while the user is still talking (is_final without
                  // speech_final), which is where it still applies.
                  const debounceMs = data.speechFinal ? 0 : TURN_DEBOUNCE_MS;

                  sessionData.silenceTimeout = setTimeout(async () => {
                    if (sessionData.bufferedTranscript.length === 0) return;

                    const fullUtterance = sessionData.bufferedTranscript.map(t => t.text).join(' ').trim();
                    const averageConfidence = sessionData.bufferedTranscript.reduce((acc, t) => acc + t.confidence, 0) / sessionData.bufferedTranscript.length;

                    // Clear the buffer for the next turn
                    sessionData.bufferedTranscript = [];

                    // The turn clock starts here: the user is done speaking and
                    // everything after this is our latency to answer.
                    sessionData.turnStartedAt = performance.now();
                    sessionData.firstAudioSent = false;

                    logger.info(`[DEBOUNCER] Turn completed. Processing user utterance: "${fullUtterance}"`);

                    if (sessionData.callHandler) {
                      try {
                        broadcastTranscriptUpdate(call._id.toString(), { source: 'user', text: fullUtterance, isFinal: true });
                        await sessionData.callHandler.processFinalTranscript(fullUtterance, averageConfidence);
                      } catch (aiError) {
                        logger.error('Error processing AI response in media stream:', aiError);
                        // Fallback response to the user so they aren't left in silence
                        if (sessionData.tts) {
                          const errorFallback = "I'm sorry, I'm having trouble processing that. Could you please repeat it?";
                          sessionData.tts.processTextChunk(errorFallback);
                          sessionData.tts.flush();
                        }
                      }
                    }
                  }, debounceMs);
                });

                deepgramService.on('error', (error) => {
                  logger.error(`Media Stream Deepgram error for call ${callSid}`, error);
                });

                // Every handler is attached, so it is now safe to let the socket
                // open and start delivering transcripts. Awaiting here rather
                // than earlier also means the handshake overlapped all of the
                // handler and TTS setup above.
                await deepgramReady;

                // Signal to frontend that the sandbox is fully ready
                if (isBrowserSandbox && ws.readyState === ws.OPEN) {
                  ws.send(JSON.stringify({ event: 'ready' }));
                  record('session.cold_start', performance.now() - connectedAt);
                }

                // Store session
                activeSessions.set(callSid, {
                  ws,
                  deepgramService,
                  sessionData,
                  streamSid
                });

                // Trigger initial AI greeting dynamically (Disabled per user request)
                // try {
                //   logger.info(`Triggering intelligent outbound greeting for ${call.customerName}`);
                //   await callHandler.startGreeting();
                // } catch (introErr) {
                //   logger.error('Failed to send initial greeting', introErr);
                // }
              } else {
                logger.error(`Critical Error: Call record not found for SID ${callSid}.`);
                // Tell the client. Without this the sandbox modal sits on
                // "Setting up the sandbox" forever -- which is exactly what
                // happens when the database is unreachable, because connectDB
                // swallows its own connection error and the server boots anyway.
                if (ws.readyState === ws.OPEN) {
                  ws.send(JSON.stringify({
                    event: 'error',
                    message: 'Could not find the session record. Please try again.'
                  }));
                }
              }
            } catch (err) {
              logger.error('Failed to init Media Stream Session', err);
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                  event: 'error',
                  message: 'The voice pipeline failed to start. Please try again.'
                }));
              }
            }

            break;

          case 'media':
            // Twilio's base64-in-JSON envelope.
            if (deepgramService) {
              deepgramService.sendAudio(Buffer.from(msg.media.payload, 'base64'));
            }
            break;

          case 'client_metrics':
            // Client-side timings, sent once at session end rather than per
            // frame so measuring does not load the path being measured.
            if (msg.metrics && typeof msg.metrics === 'object') {
              for (const [name, value] of Object.entries(msg.metrics)) {
                record(`client.${name}`, value);
              }
            }
            break;

          case 'stop':
            logger.info(`Media Stream Stopped [CallSid: ${callSid}]`);

            // Clean up Deepgram connection
            if (deepgramService) {
              deepgramService.close();
            }

            // Extract data and finish call
            await handleCallCompletion(callSid, sessionData);

            // Remove from active sessions
            activeSessions.delete(callSid);

            break;

          default:
            logger.debug(`Received unknown Twilio Stream event: ${msg.event}`);
        }
      } catch (error) {
        logger.error('Error processing Media Stream message', error);
      }
    });

    ws.on('close', async (code, reason) => {
      try {
        logger.debug(`Twilio Media Stream connection closed: [Code: ${code}] [Reason: ${reason}]`);

        if (deepgramService) {
          deepgramService.close();
        }
        if (sessionData.tts) {
          sessionData.tts.clear();
          if (typeof sessionData.tts.close === 'function') sessionData.tts.close();
        }
        // Cancel the sandbox time-limit timers so a closed session can't emit.
        if (sessionData.callHandler) sessionData.callHandler.dispose();
        if (sessionData.aiPartialTimer) {
          clearTimeout(sessionData.aiPartialTimer);
          sessionData.aiPartialTimer = null;
        }
        if (sessionData.silenceTimeout) {
          clearTimeout(sessionData.silenceTimeout);
          sessionData.silenceTimeout = null;
        }

        if (callSid) {
          // Just in case 'stop' wasn't sent
          await handleCallCompletion(callSid, sessionData);
          activeSessions.delete(callSid);
        }
      } catch (err) {
        logger.error('Error handling media stream close', err);
      }
    });

    ws.on('error', (error) => {
      logger.error('Twilio Media Stream WebSocket error', error);
      if (callSid) activeSessions.delete(callSid);
    });
  });

  logger.success('Media Stream WebSocket server initialized (Manual Dispatch Mode)');
  return mediaStreamWss;
}

/**
 * Get active streaming session for a call
 */
export function getStreamingSession(callSid) {
  return activeSessions.get(callSid);
}

