import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import DeepgramService from '../services/deepgramService.js';
import Call from '../models/Call.js';
import StreamingCallHandler from '../services/streamingCallHandler.js';
import { createTTS } from '../services/ttsFactory.js';
import { performDeepAnalysis } from '../config/gemini.js';
import { broadcastTranscriptUpdate, cleanupCallClients } from '../websocket/liveCallServer.js';
import { record, count } from '../utils/latencyMetrics.js';
import { greetingTextFor, getGreetingAudio, sliceGreeting } from '../services/greetingCache.js';
import BargeInDetector from '../services/bargeInDetector.js';
import { resolveLanguage } from '../config/languages.js';
import { t } from '../config/callStrings.js';
import Backchannel, { STABLE_FOR_MS } from '../services/backchannel.js';
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
 * Speak a short acknowledgement into the endpointing gap.
 *
 * Three things must NOT happen, and each is easy to get wrong:
 *
 *  1. It must not become the turn's first audio. `firstAudioSent` latches on the
 *     first frame, so a backchannel would make turn.mouth_to_ear measure the
 *     filler -- we would appear to have halved latency by measuring a different
 *     thing. `suppressTurnAudio` keeps the real reply as the thing being timed.
 *  2. It must not count as the agent speaking. If it did, the caller carrying on
 *     with their sentence would trip barge-in, which aborts the speculation this
 *     exists to cover for -- so the feature would destroy its own reason to run.
 *  3. It must go out with `continue: true`. A false continuation closes the
 *     Cartesia context while `_contextSeq` stays put, and the real reply then
 *     streams into a context that is no longer open.
 */
const maybeBackchannel = (sessionData, interimText) => {
  const bc = sessionData.backchannel;
  const handler = sessionData.callHandler;
  if (!bc || !handler || !sessionData.tts) return;

  const normalized = handler.constructor._normalize
    ? handler.constructor._normalize(interimText)
    : String(interimText || '').toLowerCase().trim();

  // Restart the silence clock whenever new words arrive. It has to be a timer:
  // partials stop the moment someone stops talking, so "unchanged for 260ms" can
  // never be seen by waiting for another partial to compare against.
  if (!bc.noteInterim(normalized)) return;

  if (sessionData.backchannelTimer) clearTimeout(sessionData.backchannelTimer);
  sessionData.backchannelTimer = setTimeout(() => {
    sessionData.backchannelTimer = null;
    fireBackchannel(sessionData);
  }, STABLE_FOR_MS);
};

/**
 * Speak the acknowledgement, if the moment is still right.
 *
 * The gates are checked here rather than when the timer was armed, because the
 * agent may have started speaking in the meantime.
 */
const fireBackchannel = (sessionData) => {
  const bc = sessionData.backchannel;
  const handler = sessionData.callHandler;
  if (!bc || !handler || !sessionData.tts) return;

  const ready = bc.canFire({
    speculationInFlight: Boolean(handler.speculation),
    agentSpeaking: sessionData.bargeIn.isAgentSpeaking(),
  });
  if (!ready) return;

  const token = bc.take();
  try {
    // The two guards that keep this from quietly breaking things: the audio it
    // produces is not the turn's first frame, and it does not count as the agent
    // holding the floor. See the audio handler for what each one protects.
    sessionData.suppressTurnAudio = true;
    sessionData.backchannelAt = performance.now();
    sessionData.tts.speakAside(token);
    count('backchannel.spoken');
    logger.debug(`Backchannel: "${token}"`);
  } catch (err) {
    sessionData.suppressTurnAudio = false;
    logger.debug(`Backchannel failed: ${err.message}`);
  }
};

/**
 * Speak the session opener.
 *
 * Fire-and-forget: a greeting is a nicety, and nothing about the session depends
 * on it, so this never blocks `ready` and never propagates a failure. Audio goes
 * out over the same `media` frames the TTS path uses, so the client needs no new
 * playback code for it.
 */
const playGreeting = async (ws, sessionData, callHandler, { voiceId, language, isWebCall, apiKey, streamSid, callId }) => {
  try {
    const text = greetingTextFor(callHandler.module, callHandler.voiceGender);
    if (!text) return;

    const startedAt = performance.now();
    const entry = await getGreetingAudio({ voiceId, language, isWebCall, text, apiKey });
    if (!entry) {
      count('greeting.unavailable');
      return;
    }
    if (ws.readyState !== ws.OPEN) return;

    // Measured from the point the client was told the session was ready, which
    // is when it starts listening. A warm cache makes this the wire time alone.
    record('greeting.ready_to_audio', performance.now() - startedAt);

    // Guards the barge-in path while the opener plays. Never initialized before,
    // so the check that reads it was inert.
    callHandler.isGreeting = true;

    for (const frame of sliceGreeting(entry)) {
      if (ws.readyState !== ws.OPEN) return;
      // The greeting bypasses the tts 'audio' handler, so the barge-in detector
      // has to be told about it here or it believes the agent is silent -- which
      // makes the opening line the one stretch of the session that cannot be
      // interrupted at all.
      sessionData.bargeIn.noteAgentAudio(
        Buffer.byteLength(frame.payload, 'base64'), frame.encoding, frame.sampleRate
      );
      ws.send(JSON.stringify({
        event: 'media',
        streamSid,
        media: { payload: frame.payload, encoding: frame.encoding, sampleRate: frame.sampleRate },
      }));
    }

    // Recorded in the conversation, or turn one greets the user all over again.
    callHandler.noteGreetingSpoken(text);
    broadcastTranscriptUpdate(callId, { source: 'ai', text, isFinal: true, turnId: 0 });

    // Roughly how long the opener takes to play out, after which a genuine
    // interrupt is just a normal turn again.
    const bytesPerSample = entry.encoding === 'pcm_f32le' ? 4 : 1;
    const durationMs = (entry.buffer.length / bytesPerSample / entry.sampleRate) * 1000;
    sessionData.greetingTimer = setTimeout(() => {
      callHandler.isGreeting = false;
      sessionData.greetingTimer = null;
    }, durationMs);
  } catch (err) {
    logger.warn(`Greeting playback failed: ${err.message}`);
    callHandler.isGreeting = false;
  }
};

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
      const demoModule = getDemoAgentModule(call.demoAgentId, 'Female', call.selectedLanguage);
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

    logger.info(`Reading collections outcome for call ${callSid}...`);
    const questionsList = module.questions.sort((a, b) => a.order - b.order).map(q => q.question);

    // One LLM call, not two. The old flow ran performDeepAnalysis and then
    // evaluateApplication to turn its output into QUALIFIED / BOOKED / NURTURE --
    // a sales verdict on a lead. A collections call's outcome IS the verdict, so
    // the second round trip bought nothing and cost a turn of the rate limit.
    const analysis = await performDeepAnalysis(
      sessionData.callHandler.chatHistory,
      'collections',
      call.customerName,
      module.systemPrompt || 'EMI reminder',
      questionsList,
      { today: new Date().toISOString().slice(0, 10) }
    );

    logger.info(
      `Call ${callSid}: ${analysis.outcome}` +
      (analysis.promisedOn ? ` on ${analysis.promisedOn}` : '') +
      (analysis.escalate ? ' [needs a person]' : '')
    );
    count(`outcome.${analysis.outcome}`);
    if (analysis.escalate) count('outcome.escalated');

    call.collections = {
      outcome: analysis.outcome,
      // Parsed here rather than stored as text so the desk can query "promises
      // due today" without reading every row.
      promisedOn: analysis.promisedOn ? new Date(analysis.promisedOn) : null,
      promisedAmount: analysis.promisedAmount ?? null,
      reason: analysis.reason ?? null,
      rightPartyContact: Boolean(analysis.rightPartyContact),
      escalate: Boolean(analysis.escalate),
      escalateReason: analysis.escalateReason ?? null,
      borrowerQuote: analysis.borrowerQuote ?? null,
      language: call.selectedLanguage || null,
    };

    call.summary = analysis.summary;
    call.status = 'completed';
    call.duration = Math.floor((Date.now() - call.createdAt.getTime()) / 1000);
    call.transcription = sessionData.callHandler.chatHistory;

    await call.save();
    logger.success(`Call ${callSid} saved. Questions reached: ${analysis.stageAnalysis?.questionsReached ?? '?'}/${questionsList.length}`);



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
    // Errors can fire before the Call row is read -- "session not found" is
    // precisely that case -- so the language for those messages comes from the
    // socket URL rather than from the record we do not have.
    const langHint = (() => {
      try {
        return new URL(req.url, `http://${req.headers.host}`).searchParams.get('language') || 'en-US';
      } catch {
        return 'en-US';
      }
    })();
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
      // First LLM token of the current turn, which splits the turn into the time
      // spent thinking and the time spent starting to speak. Reported to the
      // client so the latency badge can break itself down.
      firstChunkAt: null,
      // Identifies a turn across the two sockets: audio and timings go out on
      // this one, the transcript on the live-call one.
      turnId: 0,
      // Coalesced AI text for the transcript sidechannel.
      aiPartialText: '',
      aiPartialTimer: null,
      // Decides when the user has genuinely interrupted the agent.
      bargeIn: new BargeInDetector({ onSpurious: () => count('barge_in.spurious') }),
      // Wire format of the inbound audio, so energy can be read off it.
      inputEncoding: 'mulaw'
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
          if (message.length > 0 && deepgramService) {
            // Read energy here rather than have the client report it: every
            // client is then gated identically, with no protocol change and
            // nothing to trust from the far end.
            sessionData.bargeIn.noteInputFrame(message, sessionData.inputEncoding);
            deepgramService.sendAudio(message);
          }
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
                sessionData.inputEncoding = isLinearClient ? 'linear16' : 'mulaw';

                // The session's language decides both the Deepgram model and the
                // language code. nova-3 covers every Indian language we offer;
                // English stays on the model its latency baseline was measured on.
                const lang = resolveLanguage(call.selectedLanguage);

                const connectionConfig = {
                  language: lang.sttLang,
                  model: lang.sttModel,
                  smart_format: true,
                  interim_results: true,
                  // 150ms rather than 300ms, with no_delay so Deepgram stops
                  // padding before it finalizes. The application-level debounce
                  // is a second endpointer stacked on this one, so the pair was
                  // costing well over half a second per turn.
                  endpointing: 150,
                  no_delay: true,
                  utterance_end_ms: '1000',
                  // Deepgram's own voice activity detection. Off by default,
                  // which is why SpeechStarted and UtteranceEnd never arrived --
                  // utterance_end_ms was configured but inert.
                  vad_events: true,
                  encoding: isLinearClient ? 'linear16' : 'mulaw',
                  sample_rate: isLinearClient ? declaredRate : 8000,
                  channels: 1,
                  punctuate: true,
                };

                // `keywords` is a nova-2 parameter. nova-3 rejects the whole
                // connection with a 400 if it is present -- it uses `keyterm`
                // instead, and only for English. The list was English words
                // ("yes", "maybe", "interested") which did nothing for a Hindi
                // call regardless, so it is scoped to the model that accepts it.
                if (lang.sttModel.startsWith('nova-2')) {
                  connectionConfig.keywords = [
                    'yes:2', 'no:2', 'maybe:2', 'sure:2', 'okay:2',
                  ];
                }

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
                // Speaks into the window Deepgram spends deciding the caller has
                // stopped -- the only part of the perceived delay our own speed
                // cannot touch.
                sessionData.backchannel = new Backchannel({ language: lang.sttLang });
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
                    voiceId: call.selectedVoice || lang.voiceId,
                    language: lang.ttsLang,
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

                    // Tell the user when the voice fails, rather than leaving
                    // them waiting on a reply that is never going to be spoken.
                    // Cartesia returning 402 on an exhausted plan, or a socket
                    // error mid-utterance, both land here; previously both were
                    // logged server-side and looked like a broken product to
                    // whoever was listening. Once per session, so a failing
                    // provider does not spam the transcript.
                    const reportVoiceFailure = () => {
                      if (sessionData.voiceFailureReported) return;
                      sessionData.voiceFailureReported = true;
                      count('tts.session_failed');
                      if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({
                          event: 'voice_error',
                          message: t('voiceUnavailable', lang.sttLang)
                        }));
                      }
                    };
                    tts.on('synthesisFailed', reportVoiceFailure);
                    tts.on('transportError', reportVoiceFailure);
                }

                logger.info(`TTS Initialized: [${lang.label}] [Voice: ${call.selectedVoice || lang.voiceId}] [Cartesia/${ttsTransport}]`);

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
                    // Aside audio is sent but never timed, and never counts as
                    // the turn's first frame -- otherwise the headline number
                    // would quietly start measuring a one-syllable filler.
                    if (sessionData.suppressTurnAudio) {
                      sessionData.suppressTurnAudio = false;
                      if (sessionData.backchannelAt !== null && sessionData.backchannelAt !== undefined) {
                        record('backchannel.ahead_of_reply', performance.now() - sessionData.backchannelAt);
                        sessionData.backchannelAt = null;
                      }
                      ws.send(JSON.stringify({
                        event: 'media', streamSid, media: { payload, encoding, sampleRate },
                      }));
                      return;
                    }

                    let turnLatency = null;
                    if (!sessionData.firstAudioSent && sessionData.turnStartedAt !== null
                        && !sessionData.suppressLatency) {
                      sessionData.firstAudioSent = true;
                      const now = performance.now();
                      const total = now - sessionData.turnStartedAt;
                      record('turn.mouth_to_ear', total);

                      // Every boundary is already visible from here, so the stage
                      // split costs nothing extra and needs no changes upstream.
                      const thinkEnd = sessionData.firstChunkAt;
                      turnLatency = {
                        event: 'turn_latency',
                        turnId: sessionData.turnId,
                        ms: Math.round(total),
                        stages: thinkEnd === null ? null : {
                          think: Math.round(thinkEnd - sessionData.turnStartedAt),
                          speak: Math.round(now - thinkEnd),
                        },
                      };
                    }

                    // Model the client's playout schedule, so "is the agent
                    // speaking right now" is a fact rather than a guess. The
                    // client queues each frame after the last, which is exactly
                    // what the detector tracks.
                    //
                    // A backchannel is deliberately excluded: it is one syllable
                    // spoken over the caller's tail, and treating it as the agent
                    // holding the floor would make the caller finishing their own
                    // sentence look like a barge-in.
                    if (!sessionData.suppressTurnAudio) {
                      sessionData.bargeIn.noteAgentAudio(
                        Buffer.byteLength(payload, 'base64'), encoding, sampleRate
                      );
                    }

                    ws.send(JSON.stringify({
                      event: 'media',
                      streamSid: streamSid,
                      media: { payload: payload, encoding, sampleRate }
                    }));

                    // Strictly after the audio it describes, so the badge can
                    // never appear before the reply it belongs to.
                    if (turnLatency) ws.send(JSON.stringify(turnLatency));
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
                    isFinal: false,
                    turnId: sessionData.turnId
                  });
                };

                // Set up AI Event Handlers
                callHandler.on('aiResponseChunk', (text) => {
                  tts.processTextChunk(text);
                  if (sessionData.firstChunkAt === null) sessionData.firstChunkAt = performance.now();
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
                  broadcastTranscriptUpdate(call._id.toString(), {
                    source: 'ai', text: fullText, isFinal: true, turnId: sessionData.turnId
                  });
                });

                callHandler.on('callEnded', () => {
                  sessionData.bargeIn.noteAgentSilent();
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

                    // Any further transcript is proof the user is still talking,
                    // which clears a barge-in already on probation. Waiting for a
                    // completed utterance instead marked long sentences spurious.
                    if (data.text?.trim()) sessionData.bargeIn.noteSpeechConfirmed();

                    // Barge-in. Gated on whether the agent is actually speaking,
                    // on word count, on Deepgram's confidence and on input
                    // energy -- see bargeInDetector for why each one is there.
                    const verdict = sessionData.bargeIn.evaluate(data, {
                      isGreeting: Boolean(sessionData.callHandler?.isGreeting),
                    });

                    if (verdict.barge) {
                      logger.info(`Barge-in (${verdict.reason}): "${data.text.trim()}"`);
                      count('barge_in.triggered');
                      sessionData.bargeIn.noteTriggered();

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
                        // Not unconditionally: forcing IDLE used to resurrect a
                        // session the time limit had already ENDED, so a stray
                        // interim after the goodbye put the agent back to work.
                        if (sessionData.callHandler.state !== 'ENDED') {
                          sessionData.callHandler.state = 'IDLE';
                        }
                        // The interrupted turn's speculation answers a question
                        // the user abandoned mid-sentence.
                        sessionData.callHandler._abortSpeculation();
                        sessionData.callHandler.isGreeting = false;
                      }
                      if (sessionData.greetingTimer) {
                        clearTimeout(sessionData.greetingTimer);
                        sessionData.greetingTimer = null;
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
                      sessionData.firstChunkAt = null;
                      if (sessionData.aiPartialTimer) {
                        clearTimeout(sessionData.aiPartialTimer);
                        sessionData.aiPartialTimer = null;
                      }
                      sessionData.aiPartialText = '';
                      // The half-spoken sentence is never coming back, so the
                      // client should stop showing it. Only audio was cleared
                      // before, leaving the abandoned text on screen for good.
                      broadcastTranscriptUpdate(call._id.toString(), {
                        source: 'ai', text: '', isFinal: false, turnId: sessionData.turnId
                      });
                    }

                    if (sessionData.callHandler) {
                      // Start generating a reply now, against the interim text.
                      // Deepgram spends roughly 460ms deciding the speaker has
                      // stopped; this puts the LLM to work inside that window.
                      // Nothing is spoken unless the final transcript confirms it.
                      sessionData.callHandler.speculate(data.text, data.confidence);
                      broadcastTranscriptUpdate(call._id.toString(), { source: 'user', text: data.text, isFinal: false });

                      // And fill the rest of that window with the sound a person
                      // makes while you are still finishing. Gated on the reply
                      // already being generated, so there is a real wait to cover.
                      maybeBackchannel(sessionData, data.text);
                    }
                  } catch (err) {
                    logger.error('Error handling partial transcript', err);
                  }
                });

                deepgramService.on('finalTranscript', async (data) => {
                  const cleanedText = data.text?.trim();
                  if (!cleanedText) return;

                  // The user did go on to say something, so any barge-in still
                  // on probation was a real interrupt rather than noise.
                  sessionData.bargeIn.noteSpeechConfirmed();

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

                  // Named rather than inline so Deepgram's UtteranceEnd can
                  // close the turn through the same path the debounce does,
                  // instead of duplicating it.
                  sessionData.closeTurn = async () => {
                    if (sessionData.bufferedTranscript.length === 0) return;

                    const fullUtterance = sessionData.bufferedTranscript.map(t => t.text).join(' ').trim();
                    const averageConfidence = sessionData.bufferedTranscript.reduce((acc, t) => acc + t.confidence, 0) / sessionData.bufferedTranscript.length;

                    // Clear the buffer for the next turn
                    sessionData.bufferedTranscript = [];

                    // The turn clock starts here: the user is done speaking and
                    // everything after this is our latency to answer.
                    sessionData.turnStartedAt = performance.now();
                    sessionData.firstAudioSent = false;
                    sessionData.firstChunkAt = null;
                    sessionData.suppressLatency = false;
                    if (sessionData.backchannelTimer) {
                      clearTimeout(sessionData.backchannelTimer);
                      sessionData.backchannelTimer = null;
                    }
                    sessionData.backchannel?.reset();
                    sessionData.turnId += 1;

                    logger.info(`[DEBOUNCER] Turn completed. Processing user utterance: "${fullUtterance}"`);

                    if (sessionData.callHandler) {
                      try {
                        broadcastTranscriptUpdate(call._id.toString(), { source: 'user', text: fullUtterance, isFinal: true });
                        await sessionData.callHandler.processFinalTranscript(fullUtterance, averageConfidence);
                      } catch (aiError) {
                        logger.error('Error processing AI response in media stream:', aiError);
                        count('turn.fallback_spoken');
                        // Say something, in the language the call is being held
                        // in. A turn lost to a provider error used to produce
                        // nothing at all, and once it did produce something it
                        // was English -- so a Hindi conversation was interrupted
                        // by an English sentence, which is worse than silence.
                        const errorFallback = t('didNotCatch', lang.sttLang);
                        // Nothing about this turn is worth timing: the badge would
                        // report how fast we synthesized a canned apology, which
                        // makes a failure look like our quickest reply.
                        sessionData.suppressLatency = true;
                        if (sessionData.tts) {
                          sessionData.tts.processTextChunk(errorFallback);
                          sessionData.tts.flush();
                        }
                        // And show it, so the transcript matches what was heard.
                        broadcastTranscriptUpdate(call._id.toString(), {
                          source: 'ai', text: errorFallback, isFinal: true, turnId: sessionData.turnId
                        });
                      }
                    }
                  };

                  sessionData.silenceTimeout = setTimeout(() => {
                    sessionData.silenceTimeout = null;
                    sessionData.closeTurn();
                  }, debounceMs);
                });

                // Deepgram's own end-of-utterance decision, which nothing has
                // ever subscribed to: utterance_end_ms was set on the connection
                // but no listener existed, so the signal it produces was thrown
                // away and the application ran a debounce timer in its place.
                //
                // It is the backstop for the case the debounce cannot see: a
                // segment finalized without speech_final, followed by silence.
                // The debounce fires 120ms later and is usually first; when it
                // is not -- Deepgram withheld speech_final because the audio was
                // ambiguous -- this closes the turn instead of leaving the user
                // waiting on a reply that was never going to start.
                deepgramService.on('utteranceEnd', () => {
                  if (sessionData.bufferedTranscript?.length > 0 && sessionData.silenceTimeout) {
                    logger.debug('UtteranceEnd closed the turn ahead of the debounce');
                    count('turn.closed_by_utterance_end');
                    clearTimeout(sessionData.silenceTimeout);
                    sessionData.silenceTimeout = null;
                    sessionData.closeTurn?.();
                  }
                });

                // Speech onset from Deepgram's VAD. Used only to keep the
                // spurious-barge-in count honest: a barge-in that VAD agrees was
                // speech is not a false positive even if no transcript follows.
                deepgramService.on('speechStarted', () => {
                  sessionData.bargeIn.noteSpeechConfirmed();
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

                // The countdown the user watches starts when they are told the
                // session is ready, so the server's clock has to start here too.
                callHandler.startTimeLimit();

                // Store session
                activeSessions.set(callSid, {
                  ws,
                  deepgramService,
                  sessionData,
                  streamSid
                });

                // The agent speaks first. Not via callHandler.startGreeting(),
                // which asks the LLM for a line and then synthesizes it -- that
                // puts two provider round trips in front of the first word the
                // visitor ever hears. This opener is fixed per agent and cached,
                // so it is a buffer slice away.
                playGreeting(ws, sessionData, callHandler, {
                  voiceId: call.selectedVoice || lang.voiceId,
                  language: lang.ttsLang,
                  isWebCall: isHighFidelity,
                  apiKey: ttsApiKey,
                  streamSid,
                  callId: call._id.toString(),
                });
              } else {
                logger.error(`Critical Error: Call record not found for SID ${callSid}.`);
                // Tell the client. Without this the sandbox modal sits on
                // "Setting up the sandbox" forever -- which is exactly what
                // happens when the database is unreachable, because connectDB
                // swallows its own connection error and the server boots anyway.
                if (ws.readyState === ws.OPEN) {
                  ws.send(JSON.stringify({
                    event: 'error',
                    message: t('sessionNotFound', langHint)
                  }));
                }
              }
            } catch (err) {
              logger.error('Failed to init Media Stream Session', err);
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                  event: 'error',
                  message: t('pipelineFailed', langHint)
                }));
              }
            }

            break;

          case 'media':
            // Twilio's base64-in-JSON envelope.
            if (deepgramService) {
              const frame = Buffer.from(msg.media.payload, 'base64');
              sessionData.bargeIn.noteInputFrame(frame, sessionData.inputEncoding);
              deepgramService.sendAudio(frame);
            }
            break;

          case 'update_prompt':
            // Live persona editing. Applied to the next turn, not the one in
            // flight -- see StreamingCallHandler.updateInstruction.
            if (sessionData.callHandler && typeof msg.instruction === 'string') {
              // Bounded: this goes into every LLM request for the rest of the
              // session, and an unbounded string here is a way to make each of
              // them arbitrarily expensive.
              const instruction = msg.instruction.slice(0, 2000);
              const result = sessionData.callHandler.updateInstruction(instruction);
              if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({
                  event: 'prompt_updated',
                  applied: result.applied,
                  queued: result.queued,
                }));
              }
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
        if (sessionData.greetingTimer) {
          clearTimeout(sessionData.greetingTimer);
          sessionData.greetingTimer = null;
        }
        if (sessionData.backchannelTimer) {
          clearTimeout(sessionData.backchannelTimer);
          sessionData.backchannelTimer = null;
        }
        if (sessionData.bargeIn) sessionData.bargeIn.dispose();

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

