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

/**
 * How long to stop speculating after the provider rate limits us.
 *
 * Speculation buys latency by spending tokens: roughly three full-context
 * requests per turn instead of one. That is a good trade right up until the
 * provider's tokens-per-minute ceiling, at which point it is actively harmful --
 * it is what pushed us over, and the turns it costs are real answers the user
 * never hears. Backing off restores roughly two thirds of the token budget
 * exactly when there is none to spare, at the price of ~145ms on p50.
 *
 * Process-wide rather than per-session, because the quota is per-organization:
 * one session's speculation is what rate limits another's real request.
 */
const SPECULATION_COOLDOWN_MS = 20000;
let speculationPausedUntil = 0;

/** Called when a provider rate limit is observed anywhere in the process. */
export function pauseSpeculation(now = Date.now()) {
  const wasActive = now >= speculationPausedUntil;
  speculationPausedUntil = now + SPECULATION_COOLDOWN_MS;
  if (wasActive) {
    count('llm.speculation.paused');
    logger.warn(`Provider rate limited; pausing speculative prefill for ${SPECULATION_COOLDOWN_MS / 1000}s`);
  }
}

export const isSpeculationPaused = (now = Date.now()) => now < speculationPausedUntil;

/** Test seam. */
export const _resumeSpeculation = () => { speculationPausedUntil = 0; };
import Call from '../models/Call.js';
import Module from '../models/Module.js';
import logger from '../utils/logger.js';
import { getDemoAgentModule } from '../config/demoAgents.js';
import { resolveLanguage } from '../config/languages.js';
import { t } from '../config/callStrings.js';

// Cartesia voice ids plus Sarvam speaker names (v2 names kept so agents saved
// before the bulbul:v3 migration still resolve to the right gender).
const MALE_VOICES = new Set([
  '47c38ca4-5f35-497b-b1a3-415245fb35e1', '820a3788-2b37-4d21-847a-b65d8a68c99a',
  'karun', 'abhilash', 'hitesh',
  'aditya', 'rahul', 'rohan', 'ashutosh', 'amit', 'dev', 'varun', 'tarun',
  'PRABHAT', 'KAVYA', 'PRABHAT_HI', 'KAVYA_HI'
]);

/**
 * Which persona name a voice implies. Exported because the greeting line is
 * chosen at HTTP registration, well before a handler exists, and the two must
 * agree -- a female voice introducing itself as Michael is worse than silence.
 */
export function voiceGenderFor(voiceId) {
  return MALE_VOICES.has(voiceId) ? 'Male' : 'Female';
}

/**
 * Build the system prompt for a session.
 *
 * Pure, and outside the class, so it can be re-run to swap a persona mid-session
 * without also re-running initialize() -- which reloads the Call and Module rows
 * and re-arms the session time limit.
 *
 * @param {{name: string, systemPrompt?: string, questions: Array<{order: number, question: string}>}} module
 * @param {string} customerName
 */
/**
 * The borrower's situation, as a line the model can read out.
 *
 * Conduct rule 12 has always said "state the amount and the due date plainly,
 * once" -- and until now there was no amount to state, so the agent said vague
 * things where a real collections call names the figure.
 */
function borrowerBrief(borrower) {
  if (!borrower) return '';
  const parts = [];
  if (borrower.loanId) parts.push(`Loan ${borrower.loanId}`);
  if (borrower.amountDue) {
    // Grouped the Indian way -- the model reads this aloud, and 4,820 and 48,20
    // are different numbers to a listener.
    parts.push(`₹${new Intl.NumberFormat('en-IN').format(borrower.amountDue)} outstanding`);
  }
  if (borrower.dueDate) {
    const due = new Date(borrower.dueDate);
    if (!Number.isNaN(due.getTime())) {
      parts.push(`due ${due.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`);
    }
  }
  if (parts.length === 0) return '';

  return `\nTHIS CALL IS ABOUT: ${parts.join(' · ')}. Say the amount and the date in your own words when it is natural to -- once, plainly, without repeating them to apply pressure. Do not invent any other detail about their account: if they ask something you have not been told, say you will have a colleague check.\n`;
}

export function buildSystemPrompt(module, customerName, language = 'en-US', borrower = null) {
  const questionsStr = (module.questions || [])
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((q, i) => `${i + 1}. ${q.question}`)
    .join('\n');

  const personaInstruction = module.systemPrompt && module.systemPrompt.trim() !== ''
    ? module.systemPrompt
    : `You are a friendly, human-like voice assistant representing ${module.name}.`;

  // Name the language. The previous version said "speak the language the persona
  // above is written in" -- which pointed at the persona instead of at the
  // caller's choice, so selecting Marathi with a Hindi-written persona instructed
  // the model to reply in Hindi. STT listened in Marathi and a Marathi voice read
  // Hindi words. The selected language had no path to the model at all.
  const spec = resolveLanguage(language);
  const languageRule = spec.label === 'English'
    ? `LANGUAGE: Speak natural English. Do not use Hinglish or romanized regional words.`
    : `LANGUAGE: You must speak ONLY in ${spec.label} (${spec.native}). Every single word you say is in ${spec.label}. Do not switch to English mid-conversation, even if the customer uses English words or the instructions above are written in English. Everyday loan vocabulary (EMI, account, date) is normal and fine.`;

  return `
${personaInstruction}
You are speaking to ${customerName} on the phone. That is their name exactly as written -- say it as it is, never translate it, and never substitute a similar-sounding word. (Observed: "Abhigyan" was rendered as "अभियान", which is the ordinary word for "campaign", so the agent addressed the borrower as "Campaign".)

Your goal is to work the following into the conversation naturally and get answers:
${questionsStr}
${borrowerBrief(borrower)}

HOW THIS CALL WORKS:
1. YOU placed this call. Do not ask the customer how you can help them or why they called.
2. ${languageRule}
3. Keep it short, the way people actually speak on the phone -- usually a sentence, sometimes two. Never a paragraph.
4. Ask one question at a time.
5. START THE WAY A PERSON DOES. Open with a brief acknowledgement of what they just said, followed by a comma, before the substance: "Right," / "हाँ जी," / "சரி,". This is how people talk, and it is the single thing that makes you sound human rather than like a system reading out an answer. Vary it; never open the same way twice in a row.
6. Sound like a person, not a form. Contractions, natural rhythm, the odd short reaction. Do not narrate what you are doing and do not read out lists.
7. If they have already answered something, do not ask it again.
8. No markdown, emoji or special characters. Plain speech only.
9. When the conversation is done, or you have said goodbye, stop. Do not emit tokens like [END_CALL].

CONDUCT — these are not style preferences, they are the rules this call is held to:
10. IDENTITY FIRST. Confirm you are speaking to the right person before you say anything about money owed, an account, or a loan. If it is the wrong person or they will not confirm, apologise, say you will update the records, and end the call.
11. NEVER threaten. No legal action, no consequences, no visits, no mention of credit score damage, no raised voice. Not even if the customer is hostile.
12. State the amount and the due date plainly, once. Do not repeat them to apply pressure.
13. ACCEPT WHAT THEY OFFER. If they can only pay part, take it and confirm the date. Do not push for the full amount, and do not negotiate upward.
14. If they describe genuine hardship -- lost work, illness, a family emergency -- stop collecting. Acknowledge it, tell them a colleague will call to discuss options, and close warmly.
15. If they dispute the amount or say they have already paid, do not argue and do not defend the record. Take the details and tell them the team will check and come back.
16. Never discuss this debt with anyone other than the borrower. If someone else answers, ask when the borrower is available and nothing more.
17. If they ask you to stop calling, acknowledge it and say you will pass the request on.
18. If asked, say plainly that you are an automated assistant calling on the lender's behalf. Never claim to be a person.
`;
}

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
    // Which persona name the voice implies; the greeting line needs it too.
    this.voiceGender = 'Female';
    // Was never initialized, so the barge-in guard that reads it was always
    // reading undefined and therefore never fired.
    this.isGreeting = false;
    // A prompt change that arrived mid-turn, waiting for the turn to end.
    this.pendingInstruction = null;

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

      const voiceGender = voiceGenderFor(this.call?.selectedVoice);
      this.voiceGender = voiceGender;

      if (this.call && this.call.demoAgentId) {
        // Language first: it selects which persona variant is used, and it comes
        // from the caller's choice rather than from the agent.
        this.module = getDemoAgentModule(
          this.call.demoAgentId, voiceGender, this.call?.selectedLanguage
        );
      } else {
        this.module = await Module.findById(this.moduleId);
        if (!this.module) throw new Error('Module not found');
      }

      this.isSandbox = Boolean(this.call && this.callSid.startsWith('browser_sandbox_'));
      this.isAdmin = Boolean(this.call?.userId?.isAdmin);

      this.language = this.call?.selectedLanguage || 'en-US';
      this.borrower = this.call?.borrower || null;
      this.systemPrompt = buildSystemPrompt(this.module, this.customerName, this.language, this.borrower);

      logger.info(`Conversational Call Handler initialized for ${this.customerName}`);
      return true;
    } catch (error) {
      logger.error('Error initializing call handler', error);
      throw error;
    }
  }

  /**
   * Arm the sandbox time limit.
   *
   * Called when the client is told the session is ready, not from initialize().
   * initialize() runs before the STT handshake is awaited and before `ready` goes
   * out, so arming there started the server's clock roughly a second ahead of the
   * countdown the user is watching: the session died while the display still read
   * 00:01, and the client's own zero-trigger could tear the socket down partway
   * through the goodbye.
   *
   * @param {number} limitMs
   */
  startTimeLimit(limitMs = 60000) {
    if (!this.isSandbox || this.isAdmin || this.limitTimer) return;

    logger.info(`Applying ${Math.round(limitMs / 1000)}s sandbox limit for call ${this.callSid}`);
    this.limitTimer = setTimeout(() => {
      this.timeLimitReached = true;
      if (this.state === 'IDLE') {
        this.endForTimeLimit();
      }
      // If the agent is mid-turn, processFinalTranscript closes it out. That used
      // to be the only other path, so a user who simply stopped talking at 59s
      // kept the session open indefinitely -- this is the backstop for that.
      this.limitBackstop = setTimeout(() => {
        if (this.state !== 'ENDED') this.endForTimeLimit();
      }, 10000);
    }, limitMs);
  }

  /**
   * Speak a pre-synthesized opener.
   *
   * Only the bookkeeping lives here: the audio is played by the caller, which
   * owns the socket. Recording it in chatHistory is what stops turn one greeting
   * the user a second time.
   */
  noteGreetingSpoken(text) {
    if (!text) return;
    this.chatHistory += `\nAI: ${text}`;
    if (this.call) {
      this.call.transcription = this.chatHistory;
      this.call.save().catch(err => logger.error(`Error saving greeting transcript: ${err.message}`));
    }
  }

  /**
   * Swap the agent's instructions mid-session.
   *
   * The workflow this exists for is tweak, hear it, tweak again. Without it that
   * means ending the session, leaving the modal, editing the agent, coming back
   * and re-granting the microphone -- five steps to change one sentence, which is
   * enough friction that nobody iterates at all.
   *
   * Applied on the next turn, never the one already running: processFinalTranscript
   * reads the prompt once at the top, so writing it mid-turn would leave the reply
   * half-generated under one persona and half under another. A swap that arrives
   * while the agent is busy is queued and applied when it returns to IDLE.
   *
   * @param {string} instruction  the new persona text
   * @returns {{applied: boolean, queued: boolean}}
   */
  updateInstruction(instruction) {
    const text = (instruction || '').trim();
    if (!text || !this.module) return { applied: false, queued: false };
    if (this.state === 'ENDED') return { applied: false, queued: false };

    this.module = { ...this.module, systemPrompt: text };

    if (this.state !== 'IDLE') {
      // Mid-turn. Hold it rather than change the rules underneath a reply that
      // is already being generated and spoken.
      this.pendingInstruction = text;
      logger.info(`Prompt update queued for ${this.callSid}; applies next turn`);
      return { applied: false, queued: true };
    }

    this._applyInstruction(text);
    return { applied: true, queued: false };
  }

  _applyInstruction(text) {
    this.systemPrompt = buildSystemPrompt({ ...this.module, systemPrompt: text }, this.customerName, this.language, this.borrower);
    this.pendingInstruction = null;

    // Anything generated ahead of time was written under the old persona, and
    // adoption compares only the transcript text -- it has no notion of which
    // prompt produced the reply -- so a stale speculation would be spoken in the
    // voice of an instruction the user has already replaced.
    this._abortSpeculation();
    count('prompt.updated');
    logger.info(`System prompt updated for ${this.callSid}`);
  }

  /** Apply a swap that arrived while the agent was mid-turn. */
  _flushPendingInstruction() {
    if (this.pendingInstruction) this._applyInstruction(this.pendingInstruction);
  }

  /** Say goodbye and end the session because the sandbox time limit expired. */
  endForTimeLimit() {
    if (this.state === 'ENDED') return;
    this.state = 'ENDED'; // stop processing further text
    // Closed the way a person would. The old line -- "Kindly log in to use
    // further" -- was a product instruction delivered mid-conversation to
    // someone who believes they are speaking to their lender, and it was in
    // English however the call had been conducted.
    this.emit('aiResponseComplete', t('timeLimit', this.language));
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
    // Not while the provider is already refusing requests: speculating into a
    // rate limit spends the budget the user's actual question needs.
    if (isSpeculationPaused()) return;
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
      controller.signal,
      pauseSpeculation
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
          this.llmApiKey,
          null,
          pauseSpeculation
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
      count('llm.turn_failed');
      // Re-thrown, not swallowed. The caller has a spoken fallback for exactly
      // this, and catching here meant the promise resolved normally so that
      // fallback never ran: a provider rate limit -- which on a free tier is
      // routine -- left the user in total silence with nothing said and nothing
      // shown, indistinguishable from the agent having simply stopped working.
      throw error;
    } finally {
      if (this.state !== 'ENDED') {
        this.state = 'IDLE';
        // A prompt change that landed mid-turn takes effect now, at the turn
        // boundary, rather than rewriting the rules under a reply in flight.
        this._flushPendingInstruction();
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
