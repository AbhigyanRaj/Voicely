import EventEmitter from 'events';
import fetch from 'node-fetch';
import { GOOGLE_VOICES } from '../config/googleTTS.js';
import logger from '../utils/logger.js';

/**
 * Buffers text chunks from an AI stream and converts them to
 * MULAW audio for Twilio playback on sentence boundaries.
 */
class StreamingGoogleTTS extends EventEmitter {
    constructor(voiceType = 'NEERJA') {
        super();
        this.voice = GOOGLE_VOICES[voiceType] || GOOGLE_VOICES.NEERJA;
        this.textBuffer = '';
        this.isProcessing = false;
        this.audioQueue = []; // Queue of text sentences waiting to be synthesized
        this.apiKey = process.env.GOOGLE_TTS_API_KEY || process.env.GOOGLE_API_KEY;
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

    /**
     * Split buffer on sentence boundaries or natural pauses (commas)
     */
    checkBoundaries() {
        // Match sentence endings like ., ?, ! or natural pauses like commas followed by space
        // We only split on commas if the text before it is long enough (> 20 chars)
        const boundaryTokens = /([.?!]+[\s]+|,[ \s]+)/;
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
                    const audioBase64 = await this._synthesizeMulaw(textToSynth);

                    if (audioBase64) {
                        // Emit the base64 encoded mulaw audio ready for Twilio
                        this.emit('audio', audioBase64);
                    }
                } catch (err) {
                    logger.error('Streaming TTS Synthesis Error', err);
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Fetch MULAW 8000Hz from Google TTS (Optimized for Twilio playback)
     */
    async _synthesizeMulaw(text) {
        if (!this.apiKey) {
            logger.error('Google TTS API key not configured for Streaming TTS');
            return null;
        }

        const requestBody = {
            input: { text: text },
            voice: {
                languageCode: this.voice.language,
                name: this.voice.id,
                ssmlGender: this.voice.gender
            },
            audioConfig: {
                audioEncoding: 'MULAW',
                sampleRateHertz: 8000
            }
        };

        const endpoint = 'https://texttospeech.googleapis.com/v1/text:synthesize';
        logger.debug(`Synthesizing with voice ${this.voice.id} (${this.voice.language}): "${text.substring(0, 30)}..."`);
        
        const response = await fetch(`${endpoint}?key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            logger.error(`Google TTS API Error [${response.status}]:`, errorData.error?.message);
            throw new Error(`Google TTS API error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.audioContent; // This is a base64 string
    }
}

export default StreamingGoogleTTS;
