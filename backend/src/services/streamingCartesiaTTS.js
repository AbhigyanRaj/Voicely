import EventEmitter from 'events';
import CartesiaService from './cartesiaService.js';
import logger from '../utils/logger.js';

/**
 * Buffers text chunks from an AI stream and converts them to
 * MULAW audio for Twilio playback on sentence boundaries using Cartesia.
 */
class StreamingCartesiaTTS extends EventEmitter {
    constructor(voiceId = '47c38ca4-5f35-497b-b1a3-415245fb35e1', isWebCall = false, optimizeFor = 'latency', apiKey = null) {
        super();
        this.voiceId = voiceId;
        this.isWebCall = isWebCall;
        this.optimizeFor = optimizeFor;
        this.textBuffer = '';
        this.isProcessing = false;
        this.audioQueue = []; 
        this.cartesiaService = new CartesiaService(apiKey);
    }

    /**
     * Receives streaming text chunks (e.g. from Gemini)
     */
    processTextChunk(chunk) {
        this.textBuffer += chunk;
        this.checkBoundaries();
    }

    /**
     * Called when the AI stream has completely finished
     */
    flush() {
        if (this.textBuffer.trim().length > 0) {
            this.audioQueue.push(this.textBuffer.trim());
            this.textBuffer = '';
            this._processQueue();
        }
    }

    clear() {
        this.audioQueue = [];
        this.textBuffer = '';
        this.isProcessing = false;
    }

    /**
     * Split buffer on sentence boundaries or natural pauses (commas)
     */
    checkBoundaries() {
        // Only split on natural punctuation boundaries to prevent unnatural pauses mid-sentence.
        // Cartesia's REST API treats each request as a standalone phrase, so splitting mid-sentence
        // causes it to drop its intonation and add a small pause.
        // Also use negative lookbehind to avoid splitting on common abbreviations like Mr. or Dr.
        
        let boundaryTokens;
        if (this.optimizeFor === 'latency') {
            // Also split on commas to dramatically reduce time-to-first-byte
            boundaryTokens = /(?<!\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc))\s*([.?!;।,]+[\s]+)/i;
        } else {
            boundaryTokens = /(?<!\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc))\s*([.?!;।]+[\s]+)/i;
        }
        
        const parts = this.textBuffer.split(boundaryTokens);

        if (parts.length > 2) { // Need at least [sentence, boundary, remainder]
            let i = 0;
            while (i < parts.length - 2) {
                const sentence = parts[i] + parts[i + 1];
                if (sentence.trim().length > 0) {
                    this.audioQueue.push(sentence.trim());
                }
                i += 2;
            }
            this.textBuffer = parts[parts.length - 1]; // Keep remainder
            this._processQueue();
        }
    }

    /**
     * Process the synthesis queue sequentially to maintain order
     */
    async _processQueue() {
        if (this.isProcessing || this.audioQueue.length === 0) return;
        this.isProcessing = true;

        try {
            while (this.audioQueue.length > 0) {
                const textToSynth = this.audioQueue.shift();

                try {
                    let audioBase64;
                    let encoding = 'mulaw';
                    let sampleRate = 8000;

                    if (this.isWebCall) {
                        const audioBuffer = await this.cartesiaService.synthesizePCM(textToSynth, 'en', this.voiceId, 24000);
                        if (!this.isProcessing) break;
                        if (audioBuffer) {
                            audioBase64 = audioBuffer.toString('base64');
                            encoding = 'pcm_f32le';
                            sampleRate = 24000;
                        }
                    } else {
                        const audioBuffer = await this.cartesiaService.synthesizeMulaw(textToSynth, 'en', this.voiceId);
                        if (!this.isProcessing) break;
                        if (audioBuffer) {
                            audioBase64 = audioBuffer.toString('base64');
                        }
                    }

                    if (audioBase64) {
                        // Twilio media stream expects base64 payload, our web client supports custom encoding
                        this.emit('audio', { payload: audioBase64, encoding, sampleRate });
                    }
                } catch (err) {
                    logger.error('Streaming Cartesia TTS Synthesis Error', err);
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }
}

export default StreamingCartesiaTTS;
