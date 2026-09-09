import EventEmitter from 'events';
import { generateConversationalResponseStream } from '../config/gemini.js';
import { record, count } from '../utils/latencyMetrics.js';

// Speculative prefill tuning. Short or low-confidence fragments are not worth
// a request, and a minimum gap keeps a fast-changing partial from starting a
// new generation on every interim result.
const SPECULATION_MIN_CHARS = 12;
const SPECULATION_MIN_CONFIDENCE = 0.6;
const SPECULATION_MIN_GAP_MS = 150;

// Speculation buys latency with LLM calls: measured ~2.8 provider requests per
// turn for a ~29% adoption rate, worth roughly 145ms off p50. Worth it when the
// model is cheap and fast, so it defaults on -- set SPECULATIVE_PREFILL=false to
// trade the latency back for the token spend.
const SPECULATION_ENABLED = process.env.SPECULATIVE_PREFILL !== 'false';
import Call from '../models/Call.js';
import Module from '../models/Module.js';
import logger from '../utils/logger.js';
import { getDemoAgentModule } from '../config/demoAgents.js';

/**
 * Handles streaming call logic with real-time transcription
 * Manages conversation history and feeds it to Gemini Streaming
 */
class StreamingCallHandler extends EventEmitter {
  constructor(callSid, moduleId, phoneNumber, customerName, llmApiKey = null) {
    super();
    this.callSid = callSid;
    this.moduleId = moduleId;
    this.phoneNumber = phoneNumber;
    this.customerName = customerName;
    this.llmApiKey = llmApiKey;

    this.chatHistory = '';
    this.systemPrompt = '';
    this.state = 'IDLE'; // IDLE, THINKING, SPEAKING
    this.call = null;
    this.module = null;
    this.lastProcessedTranscript = '';

    // Speculative prefill. Deepgram spends roughly 460ms deciding the speaker
    // has finished, and its interim results usually converge on the complete
    // utterance before the final arrives -- the final often only adds
    // punctuation and casing. So we start generating against the latest partial
    // and buffer the tokens. If the final matches what we generated against, the
    // reply is already in hand and goes straight to TTS.
    this.speculation = null;
  }

  /**
   * Initialize the call handler
   */
  /**
   * @param {object} [preloadedCall] the Call document the caller already has.
   *   Without it this re-queries the same row the caller just fetched, which
   *   made it the third read of one document per cold start.
   */
  async initialize(preloadedCall = null) {
    try {
      this.call = preloadedCall
        ? await preloadedCall.populate('userId')
        : await Call.findOne({ twilioCallSid: this.callSid }).populate('userId');

      // Cartesia voice ids plus Sarvam speaker names (v2 names kept so agents
      // saved before the bulbul:v3 migration still resolve to the right gender).
      const maleVoices = [
        '47c38ca4-5f35-497b-b1a3-415245fb35e1', '820a3788-2b37-4d21-847a-b65d8a68c99a',
        'karun', 'abhilash', 'hitesh',
        'aditya', 'rahul', 'rohan', 'ashutosh', 'amit', 'dev', 'varun', 'tarun',
        'PRABHAT', 'KAVYA', 'PRABHAT_HI', 'KAVYA_HI'
      ];
      const voiceGender = maleVoices.includes(this.call?.selectedVoice) ? 'Male' : 'Female';

      if (this.call && this.call.demoAgentId) {
        this.module = getDemoAgentModule(this.call.demoAgentId, voiceGender);
      } else {
        this.module = await Module.findById(this.moduleId);
        if (!this.module) throw new Error('Module not found');
      }

      // 1-minute hard limit for sandbox calls, exempting admins
      if (this.call && this.callSid.startsWith('browser_sandbox_')) {
        const isAdmin = this.call.userId && this.call.userId.isAdmin;
        if (!isAdmin) {
          logger.info(`Applying 1-minute sandbox limit for call ${this.callSid}`);
          this.limitTimer = setTimeout(() => {
            this.timeLimitReached = true;
            if (this.state === 'IDLE') {
              this.endForTimeLimit();
            }
            // If the agent is mid-turn, processFinalTranscript closes it out.
            // That used to be the only other path, so a user who simply stopped
            // talking at 59s kept the session open indefinitely -- this is the
            // backstop for that.
            this.limitBackstop = setTimeout(() => {
              if (this.state !== 'ENDED') this.endForTimeLimit();
            }, 10000);
          }, 60000);
        }
      }
      // Construct a conversational system prompt dynamically
      const questionsStr = this.module.questions
        .sort((a, b) => a.order - b.order)
        .map((q, i) => `${i + 1}. ${q.question}`)
        .join('\n');

      const personaInstruction = this.module.systemPrompt && this.module.systemPrompt.trim() !== ''
        ? this.module.systemPrompt
        : `You are a friendly, human-like voice assistant representing ${this.module.name}.`;

      this.systemPrompt = `
${personaInstruction}
You are speaking to a customer named ${this.customerName} on the phone.


Your ultimate goal is to naturally weave the following questions into the conversation and get answers for them:
${questionsStr}

CRUCIAL RULES:
1. OUTBOUND CALL CONTEXT: This is an OUTBOUND call. YOU initiated the call to the customer. DO NOT ask the customer how you can help them or why they called. YOU called them to discuss the topics mentioned in your goal.
2. LANGUAGE: Speak pure, natural English. Do not use Hinglish or romanized regional words.
3. BE CONCISE. Aim for 8-15 words. Speak like you're on a quick phone call.
4. Ask one question at a time.
5. Natural Flow: Acknowledge what the user says naturally. If they go off-topic, briefly respond and then gently tie it back to the next thing you need to know.
6. CONVERSATIONAL REALISM: Use conversational bridge words to bridge sentences naturally. DO NOT use vocal fillers like "umm" or "ah".
7. Don't be a robot: If you sense the user has already answered a future question, don't ask it. Just move to the next logical step.
8. Your tone is helpful and professional but friendly.
9. No Markdown, emojis, or special characters. Plain text only.
10. CONVERSATION END: When the user's inquiry is complete, the task is done, or you have said 'Goodbye', you can stop speaking. Do NOT use any special tokens like [END_CALL].
`;

      logger.info(`Conversational Call Handler initialized for ${this.customerName}`);
      return true;
    } catch (error) {
      logger.error('Error initializing call handler', error);
      throw error;
    }
  }

  /** Say goodbye and end the session because the sandbox time limit expired. */
  endForTimeLimit() {
    if (this.state === 'ENDED') return;
    this.state = 'ENDED'; // stop processing further text
    this.emit(
      'aiResponseComplete',
      "Okay, I think the timer has completed. I'll call you later. Kindly log in to use further."
    );
    this.endTimer = setTimeout(() => this.emit('callEnded'), 5000);
  }

  /** Cancel every pending timer so a closed session can't fire callbacks. */
  dispose() {
    this._abortSpeculation();
    for (const timer of [this.limitTimer, this.limitBackstop, this.endTimer]) {
      if (timer) clearTimeout(timer);
    }
    this.limitTimer = null;
    this.limitBackstop = null;
    this.endTimer = null;
  }

  /**
   * Start the initial greeting
   */
  async startGreeting() {
    if (this.state !== 'IDLE') return;
    this.state = 'THINKING';
    this.isGreeting = true;
    
    try {
      logger.info(`Triggering initial greeting for ${this.customerName}...`);
      this.emit('aiThinking');
      
      // Feed a special prompt to Gemini to get the first greeting
      const greetingPrompt = `[START_CONVERSATION] No user input yet. Please provide your initial outbound greeting based on the persona. Introduce yourself. Respond purely in English.`;

      const greeting = await generateConversationalResponseStream(
        this.systemPrompt,
        greetingPrompt,
        (chunkText) => {
          if (this.state !== 'SPEAKING') {
            this.state = 'SPEAKING';
          }
          this.emit('aiResponseChunk', chunkText);
        },
        this.llmApiKey
      );

      this.chatHistory += `\nAI: ${greeting}`;
      
      // Update call transcript in DB (async, fire-and-forget)
      if (this.call) {
        this.call.transcription = this.chatHistory;
        this.call.save().catch(err => logger.error(`Error saving greeting transcript: ${err.message}`));
      }

      this.emit('aiResponseComplete', greeting);
    } catch (error) {
      logger.error('Error in initial greeting', error);
      this.state = 'IDLE';
    } finally {
      this.state = 'IDLE';
      this.isGreeting = false;
    }
  }

  /** Compare transcripts ignoring punctuation, casing and spacing. */
  static _normalize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Start generating against an interim transcript.
   *
   * Cheap to be wrong: a superseded attempt is aborted, and a mismatch at final
   * time is simply discarded. Nothing is ever spoken from a speculation that the
   * final transcript did not confirm.
   */
  speculate(partialTranscript, confidence) {
    if (!SPECULATION_ENABLED) return;
    if (this.state !== 'IDLE') return;

    const text = (partialTranscript || '').trim();
    if (text.length < SPECULATION_MIN_CHARS) return;
    if (confidence !== undefined && confidence !== null && confidence < SPECULATION_MIN_CONFIDENCE) return;

    const normalized = StreamingCallHandler._normalize(text);
    if (!normalized) return;

    // Already working on exactly this.
    if (this.speculation && this.speculation.normalized === normalized) return;

    // A newer partial supersedes the old attempt.
    if (this.speculation) {
      if (performance.now() - this.speculation.startedAt < SPECULATION_MIN_GAP_MS) return;
      this._abortSpeculation();
    }

    const controller = new AbortController();
    const speculation = {
      text,
      normalized,
      controller,
      buffered: [],
      startedAt: performance.now(),
      firstTokenAt: null,
      settled: false,
      error: null,
      fullText: '',
    };
    this.speculation = speculation;

    const history = `${this.chatHistory}\nUser: ${text}`;
    speculation.promise = generateConversationalResponseStream(
      this.systemPrompt,
      history,
      (chunkText) => {
        if (speculation.firstTokenAt === null) speculation.firstTokenAt = performance.now();
        speculation.buffered.push(chunkText);
        speculation.fullText += chunkText;
        // Adopted mid-flight: forward directly rather than buffering.
        if (speculation.adopted) this.emit('aiResponseChunk', chunkText);
      },
      this.llmApiKey,
      controller.signal
    )
      .then((full) => {
        speculation.settled = true;
        speculation.fullText = full;
        return full;
      })
      .catch((err) => {
        speculation.settled = true;
        speculation.error = err;
        if (err?.name !== 'AbortError') {
          logger.debug(`Speculative generation failed: ${err.message}`);
        }
        return null;
      });
  }

  _abortSpeculation() {
    if (!this.speculation) return;
    const stale = this.speculation;
    this.speculation = null;
    if (!stale.adopted) {
      try {
        stale.controller.abort();
      } catch {
        /* already settled */
      }
    }
  }

  /**
   * Process final transcript from Deepgram
   */
  async processFinalTranscript(transcript, confidence) {
    if (this.state === 'THINKING' || this.state === 'ENDED' || !transcript.trim()) return;

    // Prevent processing the same transcript twice if partial/final overlap
    if (transcript.trim() === this.lastProcessedTranscript) return;
    this.lastProcessedTranscript = transcript.trim();

    logger.info(`[LATENCY TIMER] processFinalTranscript starting for user input: "${transcript}"`);

    this.state = 'THINKING';

    try {
      logger.info(`User: "${transcript}" (confidence: ${confidence?.toFixed(2)})`);

      // Append to memory
      this.chatHistory += `\nUser: ${transcript}`;

      this.emit('aiThinking');

      const llmStartTime = performance.now();

      // Did we already generate a reply to exactly this utterance while Deepgram
      // was still deciding the speaker had finished? Adoption requires the
      // normalized text to match: a speculation built on a *prefix* of what the
      // user actually said could answer the wrong question, so it is discarded.
      const speculation = this.speculation;
      const normalizedFinal = StreamingCallHandler._normalize(transcript);
      const adopted =
        speculation && !speculation.error && speculation.normalized === normalizedFinal;

      let fullResponse;

      if (adopted) {
        this.speculation = null;
        speculation.adopted = true;
        count('llm.speculation.hit');

        this.state = 'SPEAKING';
        // Tokens generated ahead of time go out immediately; the effective
        // time-to-first-token for this turn is whatever it costs to flush them.
        record('llm.ttft', performance.now() - llmStartTime);
        for (const chunk of speculation.buffered) this.emit('aiResponseChunk', chunk);
        speculation.buffered = [];

        // Any remainder still streaming is forwarded by the speculation's own
        // onChunk, which now sees adopted === true.
        fullResponse = (await speculation.promise) ?? speculation.fullText;
        record('llm.total', performance.now() - llmStartTime);
        logger.info(`[LATENCY TIMER] Adopted speculative reply (0ms LLM wait)`);
      } else {
        if (speculation) {
          count('llm.speculation.miss');
          this._abortSpeculation();
        }

        fullResponse = await generateConversationalResponseStream(
          this.systemPrompt,
          this.chatHistory,
          (chunkText) => {
            if (this.state !== 'SPEAKING') {
              this.state = 'SPEAKING';
              const firstChunkDuration = performance.now() - llmStartTime;
              record('llm.ttft', firstChunkDuration);
              logger.info(`[LATENCY TIMER] AI First TTFB: ${firstChunkDuration.toFixed(1)}ms`);
            }
            this.emit('aiResponseChunk', chunkText);
          },
          this.llmApiKey
        );

        record('llm.total', performance.now() - llmStartTime);
      }

      logger.info(`[LATENCY TIMER] LLM generation complete in ${(performance.now() - llmStartTime).toFixed(1)}ms`);

      // Save AI's response to history
      this.chatHistory += `\nAI: ${fullResponse}`;
      logger.info(`AI: "${fullResponse}"`);

      // Fire-and-forget: the old code timed this save, but it is not awaited, so
      // the timer only ever measured how long it took to *start* the write.
      if (this.call) {
        this.call.transcription = this.chatHistory;
        this.call.save().catch(err => logger.error(`Error saving mid-call transcript: ${err.message}`));
      }

      this.emit('aiResponseComplete', fullResponse);
      
      if (this.timeLimitReached && this.state !== 'ENDED') {
        setTimeout(() => this.endForTimeLimit(), 1000);
      }

    } catch (error) {
      logger.error('Error processing final transcript', error);
      this.state = 'IDLE';
    } finally {
      if (this.state !== 'ENDED') {
        this.state = 'IDLE';
      }
    }
  }
  
  /**
   * Get current state
   */
  getState() {
    return {
      callSid: this.callSid,
      isProcessing: this.isProcessing,
      chatHistory: this.chatHistory
    };
  }
}

export default StreamingCallHandler;
