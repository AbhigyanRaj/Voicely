import EventEmitter from 'events';
import fetch from 'node-fetch';
import logger from '../utils/logger.js';

/**
 * Buffers text chunks from an LLM stream and synthesizes audio using Deepgram Aura TTS.
 * Returns raw telephony MULAW 8000Hz audio (headerless) with sub-150ms network latency.
 */
class StreamingDeepgramTTS extends EventEmitter {
    constructor(voice = 'aura-asteria-en', isWebCall = false) {
        super();
        this.voice = voice;
        this.isWebCall = isWebCall;
        this.textBuffer = '';
        this.isProcessing = false;
        this.audioQueue = []; // Queue of text clauses waiting to be synthesized
        this.apiKey = process.env.DEEPGRAM_API_KEY;
    }

    /**
     * Receives streaming text chunks (e.g. from Groq)
     */
    processTextChunk(chunk) {
        this.textBuffer += chunk;
        this.checkBoundaries();
    }

    /**
     * Called when the LLM stream has completely finished
     */
    flush() {
        if (this.textBuffer.trim().length > 0) {
            this.audioQueue.push(this.textBuffer.trim());
            this.textBuffer = '';
            this._processQueue();
        }
    }

    /**
     * Split buffer on sentence boundaries or natural breath pauses (connective words, commas)
     */
    checkBoundaries() {
        // 1. First check for punctuation boundaries (sentence endpoints or commas)
        const boundaryTokens = /([.?!;।]+[\s]+|,[ \s]+)/;
        const parts = this.textBuffer.split(boundaryTokens);

        if (parts.length > 2) { // Need at least [clause, boundary, remainder]
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
            return;
        }

        // 2. Connective word boundary fallback: split on connective words if buffer has 5+ words
        const words = this.textBuffer.trim().split(/\s+/);
        if (words.length >= 6) {
            const connectiveIndex = words.findIndex((w, idx) => {
                if (idx < 2) return false; // Don't split too early
                const lowerWord = w.toLowerCase().replace(/[^a-z]/g, '');
                return ['and', 'but', 'or', 'so', 'because'].includes(lowerWord);
            });

            if (connectiveIndex !== -1 && connectiveIndex < words.length - 1) {
                // Split right after the connective word
                const phrase = words.slice(0, connectiveIndex + 1).join(' ');
                this.textBuffer = words.slice(connectiveIndex + 1).join(' ') + ' ';
                logger.debug(`[TTS CHUNKER - DEEPGRAM] Splitting on connective: "${phrase}"`);
                this.audioQueue.push(phrase);
                this._processQueue();
                return;
            }
        }

        // 3. Fallback word limit boundary: if no natural pause is found and we exceed 7 words, split at last word
        if (words.length >= 8) {
            const phrase = words.slice(0, 7).join(' ');
            this.textBuffer = words.slice(7).join(' ') + ' ';
            logger.debug(`[TTS CHUNKER - DEEPGRAM] Splitting on word limit fallback: "${phrase}"`);
            this.audioQueue.push(phrase);
            this._processQueue();
        }
    }

    /**
     * Process the synthesis queue sequentially to maintain chronological playback order
     */
    async _processQueue() {
        if (this.isProcessing || this.audioQueue.length === 0) return;
        this.isProcessing = true;

        try {
            while (this.audioQueue.length > 0) {
                const textToSynth = this.audioQueue.shift();
                try {
                    const audioBase64 = await this._synthesizeMulaw(textToSynth);
                    if (audioBase64) {
                        this.emit('audio', audioBase64);
                    }
                } catch (err) {
                    logger.error('Deepgram Aura TTS Synthesis Error', err);
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Fetch direct headerless MULAW audio from Deepgram Speak API
     */
    async _synthesizeMulaw(text) {
        if (!this.apiKey) {
            logger.error('DEEPGRAM_API_KEY not found in environment');
            return null;
        }

        const startNetwork = performance.now();
        try {
            // Map simple friendly voice requests to exact Deepgram models
            let modelId = this.voice;
            if (modelId === 'man' || modelId === 'zeus') modelId = 'aura-zeus-en';
            else if (modelId === 'woman' || modelId === 'asteria') modelId = 'aura-asteria-en';
            else if (!modelId.startsWith('aura-')) modelId = 'aura-asteria-en'; // default fallback

            const sampleRate = this.isWebCall ? 16000 : 8000;
            // Deepgram Aura speaks raw mulaw direct natively
            const response = await fetch(`https://api.deepgram.com/v1/speak?model=${modelId}&encoding=mulaw&sample_rate=${sampleRate}&container=none`, {
                method: 'POST',
                headers: {
                    'Authorization': `Token ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ text: text })
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Deepgram Speak API Error:', errorText);
                throw new Error(`Deepgram Speak Error: ${response.status} - ${errorText}`);
            }

            const buffer = await response.buffer();
            const netDuration = performance.now() - startNetwork;
            logger.info(`[LATENCY TIMER] Deepgram Aura TTS network took ${netDuration.toFixed(1)}ms for: "${text.substring(0, 40)}..."`);
            
            return buffer.toString('base64');
        } catch (error) {
            logger.error('Deepgram Aura Synthesis Error', error);
            return null;
        }
    }
}

export default StreamingDeepgramTTS;
