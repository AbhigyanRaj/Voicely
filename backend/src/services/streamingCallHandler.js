import EventEmitter from 'events';
import { generateConversationalResponseStream } from '../config/gemini.js';
import Call from '../models/Call.js';
import Module from '../models/Module.js';
import logger from '../utils/logger.js';
import { getDemoAgentModule } from '../config/demoAgents.js';

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
      this.call = await Call.findOne({ twilioCallSid: this.callSid }).populate('userId');

      const maleVoices = ['47c38ca4-5f35-497b-b1a3-415245fb35e1', '820a3788-2b37-4d21-847a-b65d8a68c99a', 'karun', 'abhilash', 'hitesh', 'PRABHAT', 'KAVYA', 'PRABHAT_HI', 'KAVYA_HI'];
      const voiceGender = maleVoices.includes(this.call?.selectedVoice) ? 'Male' : 'Female';

      if (this.call && this.call.demoAgentId) {
        this.module = getDemoAgentModule(this.call.demoAgentId, voiceGender);
      } else {
        this.module = await Module.findById(this.moduleId);
        if (!this.module) throw new Error('Module not found');
      }

      // 3-minute hard limit for sandbox calls, exempting user@gmail.com
      if (this.call && this.callSid.startsWith('browser_sandbox_')) {
        const isAdmin = this.call.userId && this.call.userId.email === 'user@gmail.com';
        if (!isAdmin) {
          logger.info(`Applying 3-minute sandbox limit for call ${this.callSid}`);
          setTimeout(() => {
            if (this.state !== 'ENDED') {
              this.state = 'ENDED'; // Ensure we don't process further text
              this.emit('aiResponseComplete', 'This sandbox conversation has reached its three minute limit. Thank you for testing Voicely. Goodbye.');
            }
          }, 180000);
        }
      }
      const langCode = this.call?.selectedLanguage || 'english';
      const STT_LANG_MAP = {
        'hi-in': 'Hindi',
        'en-in': 'English',
        'en-us': 'English',
        'bn-in': 'Bengali',
        'gu-in': 'Gujarati',
        'kn-in': 'Kannada',
        'ml-in': 'Malayalam',
        'mr-in': 'Marathi',
        'or-in': 'Oriya',
        'pa-in': 'Punjabi',
        'ta-in': 'Tamil',
        'te-in': 'Telugu'
      };
      this.targetLanguageName = STT_LANG_MAP[langCode.toLowerCase()] || 'English';

      const languageInstruction = `CRITICAL LANGUAGE RULE: Your primary language is ${this.targetLanguageName}. 
- You MUST initiate the conversation and respond exclusively in ${this.targetLanguageName}. 
- ENGLISH RULE: If the language is English, speak PURE English. DO NOT use Hinglish or romanized regional words (like 'Namaskar', 'Ji', or 'Aapka').
- REGIONAL LANGUAGE RULE: If the language is a regional Indian language (like Hindi, Marathi, Bengali, etc.), keep the vocabulary VERY SIMPLE and CONVERSATIONAL. Do not use overly formal, complex, or bookish words. It is highly encouraged to mix in common English words naturally to make it sound like a real modern everyday conversation.
- SCRIPT RULE: You MUST generate the text using the native script for ${this.targetLanguageName} (e.g., Devanagari for Hindi/Marathi, Bengali script for Bengali, Gujarati script for Gujarati). DO NOT use Roman/English letters to write regional languages. 
- NEVER provide translations in English. Provide ONLY the final spoken text.
- If the user speaks to you in a different language, you should briefly acknowledge their response naturally, but ALWAYS ask your next question in ${this.targetLanguageName}.`;

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
1. OUTBOUND CALL CONTEXT: This is an OUTBOUND call. YOU initiated the call to the customer. DO NOT ask the customer how you can help them or why they called. YOU called them to discuss the topics mentioned in your goal.
2. INTELLIGENT LANGUAGE ADHERENCE: Follow the Critical Language Rule above. Acknowledge the user naturally but always steer the conversation back using ${this.targetLanguageName}.
3. BE CONCISE. Aim for 8-15 words. Speak like you're on a quick phone call.
4. Ask one question at a time.
5. Natural Flow: Acknowledge what the user says naturally. If they go off-topic, briefly respond and then gently tie it back to the next thing you need to know.
6. CONVERSATIONAL REALISM: Use conversational bridge words to bridge sentences naturally. DO NOT use vocal fillers like "umm" or "ah".
7. Don't be a robot: If you sense the user has already answered a future question, don't ask it. Just move to the next logical step.
8. Your tone is helpful and professional but friendly.
9. No Markdown, emojis, or special characters. Plain text only.
10. NATIVE SCRIPT ONLY: Make sure to generate text exclusively in the native script of ${this.targetLanguageName}. DO NOT include English translations!
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
    this.isGreeting = true;
    
    try {
      logger.info(`Triggering initial greeting for ${this.customerName}...`);
      this.emit('aiThinking');
      
      // Feed a special prompt to Gemini to get the first greeting
      const greetingPrompt = this.targetLanguageName.toLowerCase() === 'english'
        ? `[NEW CALL STARTED - NO USER INPUT YET. PLEASE PROVIDE YOUR INITIAL OUTBOUND GREETING BASED ON THE PERSONA. INTRODUCE YOURSELF. RESPOND PURELY IN ENGLISH.]`
        : `[NEW CALL STARTED - NO USER INPUT YET. PLEASE PROVIDE YOUR INITIAL OUTBOUND GREETING BASED ON THE PERSONA. INTRODUCE YOURSELF. RESPOND STRICTLY IN THE NATIVE SCRIPT OF ${this.targetLanguageName} WITHOUT ANY ENGLISH TRANSLATION.]`;

      const greeting = await generateConversationalResponseStream(
        this.systemPrompt,
        greetingPrompt,
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
      this.state = 'IDLE';
    } finally {
      this.state = 'IDLE';
      this.isGreeting = false;
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
    if (this.state === 'THINKING' || this.state === 'ENDED' || !transcript.trim()) return;

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
