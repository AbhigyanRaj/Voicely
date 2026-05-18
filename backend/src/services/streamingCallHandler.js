import EventEmitter from 'events';
import { generateConversationalResponseStream } from '../config/gemini.js';
import Call from '../models/Call.js';
import Module from '../models/Module.js';
import logger from '../utils/logger.js';

/**
 * Handles streaming call logic with real-time transcription
 * Manages conversation history and feeds it to Gemini Streaming
 */
class StreamingCallHandler extends EventEmitter {
  constructor(callSid, moduleId, phoneNumber, customerName) {
    super();
    this.callSid = callSid;
    this.moduleId = moduleId;
    this.phoneNumber = phoneNumber;
    this.customerName = customerName;

    this.chatHistory = '';
    this.systemPrompt = '';
    this.state = 'IDLE'; // IDLE, THINKING, SPEAKING
    this.call = null;
    this.module = null;
    this.lastProcessedTranscript = '';
  }

  /**
   * Initialize the call handler
   */
  async initialize() {
    try {
      this.module = await Module.findById(this.moduleId);
      if (!this.module) throw new Error('Module not found');

      this.call = await Call.findOne({ twilioCallSid: this.callSid });
      const targetLanguage = (this.call?.selectedLanguage || 'english').toLowerCase();
      const languageInstruction = `CRITICAL LANGUAGE RULE: Your primary language is ${targetLanguage}. 
- You MUST initiate the conversation in ${targetLanguage}. 
- If the user speaks to you in a different language (e.g., English, Hindi), you should briefly acknowledge their response naturally, but ALWAYS ask your next question in ${targetLanguage}.
- Never fully switch away from your primary language (${targetLanguage}). Be intelligent and conversational, acting as a bridge between their language and yours.`;

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

LANGUAGE INSTRUCTION: ${languageInstruction}

Your ultimate goal is to naturally weave the following questions into the conversation and get answers for them:
${questionsStr}

CRUCIAL RULES:
1. INTELLIGENT LANGUAGE ADHERENCE: Follow the Critical Language Rule above. Acknowledge the user naturally but always steer the conversation back using ${targetLanguage}.
2. BE CONCISE. Aim for 8-15 words. Speak like you're on a quick phone call.
3. Ask one question at a time.
4. Natural Flow: Acknowledge what the user says naturally. If they go off-topic, briefly respond and then gently tie it back to the next thing you need to know.
5. CONVERSATIONAL REALISM: Use conversational bridge words (e.g., "got it", "right", "okay") to bridge sentences naturally. DO NOT use vocal fillers like "umm" or "ah".
6. Don't be a robot: If you sense the user has already answered a future question, don't ask it. Just move to the next logical step.
7. Your tone is helpful and professional but friendly.
8. No Markdown or special characters. Plain text only.
9. INITIAL GREETING: If the target language is Hindi, your first interaction should be in Hindi.
10. Make sure to genrate text in lanagague which is selacted like if hindi then hindi text is genrated is user say english then english text is genrated and same for all other languages
11. CONVERSATION END: When the user's inquiry is complete, the task is done, or you have said 'Goodbye', you can stop speaking. Do NOT use any special tokens like [END_CALL].
`;

      logger.info(`Conversational Call Handler initialized for ${this.customerName}`);
      return true;
    } catch (error) {
      logger.error('Error initializing call handler', error);
      throw error;
    }
  }

  /**
   * Start the initial greeting
   */
  async startGreeting() {
    if (this.state !== 'IDLE') return;
    this.state = 'THINKING';
    
    try {
      logger.info(`Triggering initial greeting for ${this.customerName}...`);
      this.emit('aiThinking');
      
      // Feed a special prompt to Gemini to get the first greeting
      const greeting = await generateConversationalResponseStream(
        this.systemPrompt,
        "[NEW CALL STARTED - NO USER INPUT YET. PLEASE PROVIDE YOUR INITIAL GREETING BASED ON THE PERSONA. INTRODUCE YOURSELF.]",
        (chunkText) => {
          if (this.state !== 'SPEAKING') {
            this.state = 'SPEAKING';
          }
          this.emit('aiResponseChunk', chunkText);
        }
      );

      this.chatHistory += `\nAI: ${greeting}`;
      
      // Update call transcript in DB
      if (this.call) {
        this.call.transcription = this.chatHistory;
        await this.call.save();
      }

      this.emit('aiResponseComplete', greeting);
    } catch (error) {
      logger.error('Error in initial greeting', error);
    } finally {
      this.state = 'IDLE';
    }
  }

  /**
   * Process partial transcript for "Pre-thinking"
   */
  async processPartialTranscript(transcript, confidence) {
    // If we are already thinking or speaking, ignore partials
    if (this.state !== 'IDLE') return;

    // "Pre-think" logic: If the user has said a significant amount with high confidence,
    // we can start generating a response even before they officially finish.
    if (transcript.length > 20 && confidence > 0.8) {
      // Trigger AI thinking early if there's a natural pause or long enough text
      // This is a subtle optimization to hide latency
      logger.debug(`Low-latency trigger: Pre-processing partial transcript...`);
      // We don't change state to THINKING here to allow finalTranscript to take over properly
    }
  }

  /**
   * Process final transcript from Deepgram
   */
  async processFinalTranscript(transcript, confidence) {
    if (this.state === 'THINKING' || !transcript.trim()) return;

    // Prevent processing the same transcript twice if partial/final overlap
    if (transcript.trim() === this.lastProcessedTranscript) return;
    this.lastProcessedTranscript = transcript.trim();

    const startTotal = performance.now();
    logger.info(`[LATENCY TIMER] processFinalTranscript starting for user input: "${transcript}"`);

    this.state = 'THINKING';

    try {
      logger.info(`User: "${transcript}" (confidence: ${confidence?.toFixed(2)})`);

      // Append to memory
      this.chatHistory += `\nUser: ${transcript}`;

      this.emit('aiThinking');

      const startLLM = performance.now();
      // Stream the AI response
      const fullResponse = await generateConversationalResponseStream(
        this.systemPrompt,
        this.chatHistory,
        (chunkText) => {
          if (this.state !== 'SPEAKING') {
            this.state = 'SPEAKING';
            const timeToFirstSpeak = performance.now() - startTotal;
            logger.info(`[LATENCY TIMER] First speech output triggered in ${timeToFirstSpeak.toFixed(1)}ms from user final transcript!`);
          }
          this.emit('aiResponseChunk', chunkText);
        }
      );

      const llmDuration = performance.now() - startLLM;
      logger.info(`[LATENCY TIMER] LLM generation complete in ${llmDuration.toFixed(1)}ms`);

      // Save AI's response to history
      this.chatHistory += `\nAI: ${fullResponse}`;
      logger.info(`AI: "${fullResponse}"`);

      const startSave = performance.now();
      // Update call transcript in DB
      if (this.call) {
        this.call.transcription = this.chatHistory;
        await this.call.save();
      }
      const saveDuration = performance.now() - startSave;
      logger.info(`[LATENCY TIMER] Database transcription save took ${saveDuration.toFixed(1)}ms`);

      const startComplete = performance.now();
      this.emit('aiResponseComplete', fullResponse);
      const completeDuration = performance.now() - startComplete;
      logger.info(`[LATENCY TIMER] aiResponseComplete emission took ${completeDuration.toFixed(1)}ms`);

      const totalDuration = performance.now() - startTotal;
      logger.info(`[LATENCY TIMER] Total processFinalTranscript finished in ${totalDuration.toFixed(1)}ms`);

    } catch (error) {
      logger.error('Error in conversational processing', error);
      this.emit('error', error);
    } finally {
      this.state = 'IDLE';
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
