import express from 'express';
import { WebSocketServer } from 'ws';
import DeepgramService from '../services/deepgramService.js';
import Call from '../models/Call.js';
import StreamingCallHandler from '../services/streamingCallHandler.js';
import StreamingGoogleTTS from '../services/streamingGoogleTTS.js';
import { StreamingSarvamTTS } from '../services/sarvamService.js';
import StreamingDeepgramTTS from '../services/streamingDeepgramTTS.js';
import StreamingCartesiaTTS from '../services/streamingCartesiaTTS.js';
import { extractAnswersJSON, evaluateApplication, performDeepAnalysis } from '../config/gemini.js';
import { broadcastTranscriptUpdate } from '../websocket/liveCallServer.js';
import * as callService from '../services/callService.js';
import { sendIntelligentSummary } from '../services/botService.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Store active streaming sessions
const activeSessions = new Map();



/**
 * Handle call completion data extraction
 */
const handleCallCompletion = async (callSid, sessionData) => {
  if (sessionData.hasCompleted) return;
  sessionData.hasCompleted = true; // Prevent double execution

  try {
    const call = await Call.findOne({ twilioCallSid: callSid });
    if (!call || !sessionData.callHandler) return;

    const module = await import('../models/Module.js').then(m => m.default.findById(call.moduleId));
    if (!module) return;

    logger.info(`Extracting JSON answers for call ${callSid}...`);
    // Extract questions array
    const questionsList = module.questions.sort((a, b) => a.order - b.order).map(q => q.question);

    const workspace = await import('../models/Workspace.js').then(m => m.default.findById(call.workspaceId));
    const category = workspace?.category || 'startup';

    // Perform Deep Behavioral Analysis
    const deepAnalysis = await performDeepAnalysis(
      sessionData.callHandler.chatHistory,
      module.type || 'custom',
      call.customerName,
      module.systemPrompt || 'General Business Inquiry',
      questionsList
    );

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
        questionsReached: deepAnalysis.stageAnalysis.questionsReached,
        dropOffPoint: deepAnalysis.stageAnalysis.dropOffPoint,
      }
    };
    
    call.responses = deepAnalysis.extractedData;
    call.summary = deepAnalysis.summary;
    call.status = 'completed';
    call.duration = Math.floor((Date.now() - call.createdAt.getTime()) / 1000);
    call.transcription = sessionData.callHandler.chatHistory;

    await call.save();
    logger.success(`Call ${callSid} analytics saved successfully. Questions: ${deepAnalysis.stageAnalysis.questionsReached}/${questionsList.length}`);

    // EXCLUSIVE: Sync call to Lead Journey / Timeline
    try {
        const { syncCallToLead } = await import('../services/leadService.js');
        await syncCallToLead(call, deepAnalysis);
    } catch (leadErr) {
        logger.error(`Lead Sync failed for call ${callSid}:`, leadErr);
    }

    // Push summary to Telegram only if call source is telegram
    if (call.source === 'telegram') {
        try {
            await sendIntelligentSummary(call.userId, call);
        } catch (botErr) {
            logger.error(`Failed to push Telegram summary for call ${callSid}:`, botErr);
        }
    }

  } catch (err) {
    logger.error(`Error in handleCallCompletion for ${callSid}:`, err);
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
    logger.info(`New Twilio Media Stream connection initiated from ${req.socket.remoteAddress}`);

    let streamSid = null;
    let callSid = null;
    let deepgramService = null;
    let sessionData = {
      partialTranscripts: [],
      finalTranscripts: [],
      currentUtterance: '',
      lastTranscriptTime: Date.now(),
      silenceTimeout: null
    };

    ws.on('message', async (message) => {
      try {
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
              // Retry finding the call record with a small delay
              let call = null;
              for (let i = 0; i < 5; i++) {
                call = await Call.findOne({ twilioCallSid: callSid });
                if (call) break;
                logger.warn(`Call record not found yet (attempt ${i + 1}/5), retrying...`);
                await new Promise(resolve => setTimeout(resolve, 500));
              }

              if (call) {
                logger.success(`Call record found: ${call._id}. Initializing handlers...`);
                const callHandler = new StreamingCallHandler(callSid, call.moduleId, call.phoneNumber, call.customerName);
                await callHandler.initialize();
                
                // CRITICAL: Inject prior context for scheduled follow-ups
                if (call.priorContext) {
                    logger.info(`Injecting prior context into Call ${callSid}`);
                    callHandler.chatHistory = `[PREVIOUS CONVERSATION CONTEXT]\n${call.priorContext}\n\n[NEW CALL START]\n` + callHandler.chatHistory;
                }
                
                sessionData.callHandler = callHandler;

                // Initialize TTS based on explicit provider preference
                const ttsProvider = call.ttsProvider || 'google';
                const isBrowserSandbox = req.url.includes('/browser');
                const optimizeFor = call.optimizeFor || 'latency';
                const isHighFidelity = isBrowserSandbox && optimizeFor === 'quality';
                
                let tts;
                if (ttsProvider === 'sarvam') {
                    tts = new StreamingSarvamTTS(call.selectedLanguage || 'hi-IN', call.selectedVoice || 'anushka', isHighFidelity, optimizeFor);
                } else if (ttsProvider === 'cartesia') {
                    tts = new StreamingCartesiaTTS(call.selectedVoice || '47c38ca4-5f35-497b-b1a3-415245fb35e1', isHighFidelity, optimizeFor);
                } else if (ttsProvider === 'deepgram') {
                    tts = new StreamingDeepgramTTS(call.selectedVoice || 'aura-asteria-en', isHighFidelity);
                } else {
                    tts = new StreamingGoogleTTS(call.selectedVoice || 'NEERJA', isHighFidelity);
                }
                sessionData.tts = tts;

                logger.info(`TTS Initialized: [Voice: ${call.selectedVoice || 'DEFAULT'}] [Lang: ${call.selectedLanguage || 'en-IN'}] [Provider: ${ttsProvider}]`);

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

                    ws.send(JSON.stringify({
                      event: 'media',
                      streamSid: streamSid,
                      media: { payload: payload, encoding, sampleRate }
                    }));
                  }
                });

                // Set up AI Event Handlers
                callHandler.on('aiResponseChunk', (text) => {
                  tts.processTextChunk(text);
                  broadcastTranscriptUpdate(call._id.toString(), { source: 'ai', text: text, isFinal: false });
                });

                callHandler.on('aiResponseComplete', (fullText) => {
                  tts.flush();
                  broadcastTranscriptUpdate(call._id.toString(), { source: 'ai', text: fullText, isFinal: true });
                });


                // Initialize Deepgram connection
                const STT_LANG_MAP = {
                  'english': 'en-US',
                  'en-in': 'en-IN',
                  'en-us': 'en-US',
                  'hindi': 'hi',
                  'hi-in': 'hi',
                  
                  // Regional languages supported natively by Deepgram Nova-3
                  'bengali': 'bn',
                  'bn-in': 'bn',
                  'telugu': 'te',
                  'te-in': 'te',
                  'marathi': 'mr',
                  'mr-in': 'mr',
                  'tamil': 'ta',
                  'ta-in': 'ta',
                  'kannada': 'kn',
                  'kn-in': 'kn',
                  'gujarati': 'gu',
                  'gu-in': 'gu',
                  'malayalam': 'ml',
                  'ml-in': 'ml',
                  'oriya': 'or',
                  'or-in': 'or',
                  'punjabi': 'pa',
                  'pa-in': 'pa'
                };

                deepgramService = new DeepgramService();
                const sttLanguage = STT_LANG_MAP[call.selectedLanguage?.toLowerCase()] || 'en-US';
                
                let sttModel = undefined;
                if (sttLanguage === 'en-US' || sttLanguage === 'en-IN') {
                    sttModel = process.env.DEEPGRAM_MODEL || 'nova-2-phonecall';
                } else if (sttLanguage === 'hi') {
                    sttModel = 'nova-2';
                }
                
                const connectionConfig = {
                  language: sttLanguage,
                  smart_format: true,
                  interim_results: true,
                  endpointing: 200,
                  encoding: 'mulaw',
                  sample_rate: 8000,
                  channels: 1,
                  punctuate: true,
                  keywords: ['yes:2', 'no:2', 'maybe:2', 'sure:2', 'okay:2', 'interested:2', 'not interested:2']
                };
                if (sttModel) {
                  connectionConfig.model = sttModel;
                }

                await deepgramService.createLiveConnection(connectionConfig);

                // Initialize buffered transcript array
                sessionData.bufferedTranscript = [];

                // Handle Deepgram transcripts
                deepgramService.on('partialTranscript', async (data) => {
                  sessionData.partialTranscripts.push(data);
                  sessionData.currentUtterance = data.text;
                  sessionData.lastTranscriptTime = Date.now();

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
                      }
                      
                      // Clear debouncer state to avoid cross-talk processing
                      sessionData.bufferedTranscript = [];
                      if (sessionData.silenceTimeout) {
                        clearTimeout(sessionData.silenceTimeout);
                        sessionData.silenceTimeout = null;
                      }
                    }
                  }

                  if (sessionData.callHandler) {
                    await sessionData.callHandler.processPartialTranscript(data.text, data.confidence);
                    broadcastTranscriptUpdate(call._id.toString(), { source: 'user', text: data.text, isFinal: false });
                  }
                });

                deepgramService.on('finalTranscript', async (data) => {
                  const cleanedText = data.text?.trim();
                  if (!cleanedText) return;

                  logger.debug(`Stream Segment Received: "${cleanedText}" (${(data.confidence * 100).toFixed(0)}%)`);
                  sessionData.bufferedTranscript.push(data);

                  // Reset turns with a 650ms debouncer to let the user complete their thoughts naturally
                  if (sessionData.silenceTimeout) {
                    clearTimeout(sessionData.silenceTimeout);
                    sessionData.silenceTimeout = null;
                  }

                  sessionData.silenceTimeout = setTimeout(async () => {
                    if (sessionData.bufferedTranscript.length === 0) return;

                    const fullUtterance = sessionData.bufferedTranscript.map(t => t.text).join(' ').trim();
                    const averageConfidence = sessionData.bufferedTranscript.reduce((acc, t) => acc + t.confidence, 0) / sessionData.bufferedTranscript.length;

                    // Clear the buffer for the next turn
                    sessionData.bufferedTranscript = [];

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
                  }, 250);
                });

                deepgramService.on('error', (error) => {
                  logger.error(`Media Stream Deepgram error for call ${callSid}`, error);
                });

                // Store session
                activeSessions.set(callSid, {
                  ws,
                  deepgramService,
                  sessionData,
                  streamSid
                });

                // Trigger initial AI greeting dynamically
                try {
                  logger.info(`Triggering intelligent outbound greeting for ${call.customerName}`);
                  await callHandler.startGreeting();
                } catch (introErr) {
                  logger.error('Failed to send initial greeting', introErr);
                }
              } else {
                logger.error(`Critical Error: Call record not found for SID ${callSid} after multiple retries.`);
              }
            } catch (err) {
              logger.error('Failed to init Media Stream Session', err);
            }

            break;

          case 'media':
            // Forward audio to Deepgram
            if (deepgramService && deepgramService.isActive()) {
              const audioPayload = Buffer.from(msg.media.payload, 'base64');
              deepgramService.sendAudio(audioPayload);
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
      logger.debug(`Twilio Media Stream connection closed: [Code: ${code}] [Reason: ${reason}]`);

      if (deepgramService) {
        deepgramService.close();
      }

      if (callSid) {
        // Just in case 'stop' wasn't sent
        await handleCallCompletion(callSid, sessionData);
        activeSessions.delete(callSid);
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

/**
 * Handle manual intervention from the LiveCall dashboard
 */
export const handleManualIntervention = async (callId, text) => {
  try {
    // We need to find the session by callId (dashboard uses mongo ID)
    // but activeSessions is keyed by TWILIO call SID.
    // Let's iterate or find the call first.
    const call = await Call.findById(callId);
    if (!call) {
      logger.error(`Manual intervention failed: Call ${callId} not found in DB`);
      return;
    }

    const session = activeSessions.get(call.twilioCallSid);
    if (!session) {
      logger.warn(`Manual intervention skip: Call ${call.twilioCallSid} is not active in media stream`);
      return;
    }

    const { ws, streamSid, sessionData } = session;

    logger.info(`EXECUTIVE INTERVENTION for Call ${call.twilioCallSid}: "${text}"`);

    // 1. Barge-in: Clear current AI audio
    if (ws.readyState === 1 && streamSid) {
      ws.send(JSON.stringify({ event: 'clear', streamSid }));
    }

    if (sessionData.tts) {
      sessionData.tts.audioQueue = [];
      sessionData.tts.textBuffer = '';
    }

    // 2. AI Context Injection: Update brain memory
    if (sessionData.callHandler) {
      sessionData.callHandler.chatHistory += `\nAI (Admin Intervention): ${text}`;
      sessionData.callHandler.state = 'IDLE'; // Stop AI from thinking/speaking
    }

    // 3. Play Human Audio
    if (sessionData.tts) {
        sessionData.tts.processTextChunk(text);
        sessionData.tts.flush();
    }

    // 4. Update Dashboard Transcript Bubble
    broadcastTranscriptUpdate(callId.toString(), { 
        source: 'ai', // Mark as AI but the UI will style it as intervention
        text: text, 
        isFinal: true,
        type: 'intervention' // Add a type hint for the frontend
    });

  } catch (err) {
    logger.error('Error in handleManualIntervention:', err);
  }
};

export default router;
