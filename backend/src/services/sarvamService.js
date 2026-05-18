import EventEmitter from 'events';
import fetch from 'node-fetch';
import pkg from 'wavefile';
const { WaveFile } = pkg;
import logger from '../utils/logger.js';

/**
 * Sarvam AI Service for TTS and STT
 * Optimized for Indian regional languages and low-latency streaming.
 */
class SarvamService extends EventEmitter {
    constructor() {
        super();
        this.apiKey = process.env.SARVAM_API_KEY;
        this.ttsUrl = 'https://api.sarvam.ai/text-to-speech';
        this.sttUrl = 'https://api.sarvam.ai/speech-to-text';
    }

    /**
     * Synthesize text to MULAW 8000Hz audio (Base64)
     * @param {string} text - Text to synthesize
     * @param {string} languageCode - Language code (e.g. 'hi-IN')
     * @param {string} speaker - Speaker name (e.g. 'anushka')
     * @returns {Promise<string>} - Base64 encoded mulaw audio
     */
    async synthesizeMulaw(text, languageCode = 'hi-IN', speaker = 'anushka', isWebCall = false) {
        if (!this.apiKey) {
            logger.error('SARVAM_API_KEY not found in environment');
            return null;
        }

        const startTotal = performance.now();
        logger.info(`[LATENCY TIMER] Starting Sarvam TTS synthesis for text: "${text}"`);

        try {
            const sampleRate = isWebCall ? 16000 : 8000;
            const startNetwork = performance.now();
            const response = await fetch(this.ttsUrl, {
                method: 'POST',
                headers: {
                    'api-subscription-key': this.apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: [text],
                    target_language_code: languageCode,
                    speaker: speaker, // Dynamic speaker based on param
                    model: 'bulbul:v2',   // Using 'bulbul:v2' (valid model)
                    sampling_rate: sampleRate,
                    enable_preprocessing: false
                })
            });

            const netDuration = performance.now() - startNetwork;
            logger.info(`[LATENCY TIMER] Sarvam network request took ${netDuration.toFixed(1)}ms`);

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Sarvam API payload error:', errorText);
                throw new Error(`Sarvam TTS Error: ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();
            const audioStr = data.audios?.[0];
            if (!audioStr) return null;

            const startTranscode = performance.now();
            // Sarvam returns a full WAV file encoded in 22050Hz Linear PCM.
            // Twilio WebSockets strictly require raw 8000Hz 8-bit mulaw (headerless).
            // We use `wavefile` to transcode and extract the pure samples.
            const wavBuffer = Buffer.from(audioStr, 'base64');
            const wav = new WaveFile();
            wav.fromBuffer(wavBuffer);
            
            // 1. Downsample to target sampleRate
            wav.toSampleRate(sampleRate);
            
            // 2. Transcode the Linear PCM to 8-bit Mu-Law
            wav.toMuLaw();
            
            // 3. Extract just the raw audio samples without the RIFF/WAVE header
            // wav.data.samples contains the raw Float64Array or Uint8Array.
            const rawAudioBuf = Buffer.from(wav.data.samples);
            const transcodeDuration = performance.now() - startTranscode;
            const totalDuration = performance.now() - startTotal;

            logger.info(`[LATENCY TIMER] Wavefile transcode took ${transcodeDuration.toFixed(1)}ms`);
            logger.info(`[LATENCY TIMER] Total Sarvam Synthesis finished in ${totalDuration.toFixed(1)}ms`);

            return rawAudioBuf.toString('base64');
        } catch (error) {
            logger.error('Sarvam Synthesis Error', error);
            return null;
        }
    }

    /**
     * Placeholder for Sarvam Streaming STT logic
     * (Will be implemented once WebSocket specs are fully verified)
     */
    async startStreamingSTT(options = {}) {
        logger.info('Sarvam Streaming STT initialization requested (Experimental)');
        // Implementation pending official streaming SDK integration
    }
}

/**
 * Buffers text chunks and synthesizes audio using Sarvam AI
 */
export class StreamingSarvamTTS extends EventEmitter {
    constructor(languageCode = 'hi-IN', speaker = 'anushka', isWebCall = false) {
        super();
        this.languageCode = languageCode;
        this.speaker = speaker;
        this.isWebCall = isWebCall;
        this.textBuffer = '';
        this.isProcessing = false;
        this.audioQueue = [];
        this.sarvam = new SarvamService();
    }

    processTextChunk(chunk) {
        this.textBuffer += chunk;
        this.checkBoundaries();
    }

    flush() {
        if (this.textBuffer.trim().length > 0) {
            this.audioQueue.push(this.textBuffer.trim());
            this.textBuffer = '';
            this._processQueue();
        }
    }

    checkBoundaries() {
        // 1. First check for punctuation boundaries (sentence endpoints or commas)
        const boundaryTokens = /([।?!.;]+\s+|,[\s]*)/;
        const parts = this.textBuffer.split(boundaryTokens);

        if (parts.length > 2) {
            let i = 0;
            while (i < parts.length - 2) { // Process pairs of (text, delimiter)
                const sentence = parts[i] + parts[i + 1];
                if (sentence.trim().length > 0) {
                    this.audioQueue.push(sentence.trim());
                }
                i += 2;
            }
            this.textBuffer = parts.slice(i).join('');
            this._processQueue();
            return;
        }

        // 2. Connective word boundary fallback: split on connective words if buffer has 5+ words
        const words = this.textBuffer.trim().split(/\s+/);
        if (words.length >= 6) {
            const connectiveIndex = words.findIndex((w, idx) => {
                if (idx < 2) return false; // Don't split too early
                const lowerWord = w.toLowerCase().replace(/[^a-zअ-ज्ञ]/g, '');
                return ['and', 'but', 'or', 'so', 'because', 'कि', 'और', 'तो', 'लेकिन', 'फिर'].includes(lowerWord);
            });

            if (connectiveIndex !== -1 && connectiveIndex < words.length - 1) {
                const phrase = words.slice(0, connectiveIndex + 1).join(' ');
                this.textBuffer = words.slice(connectiveIndex + 1).join(' ') + ' ';
                logger.debug(`[TTS CHUNKER - SARVAM] Splitting on connective: "${phrase}"`);
                this.audioQueue.push(phrase);
                this._processQueue();
                return;
            }
        }

        // 3. Fallback word limit boundary: if no natural pause is found and we exceed 7 words, split at last word
        if (words.length >= 8) {
            const phrase = words.slice(0, 7).join(' ');
            this.textBuffer = words.slice(7).join(' ') + ' ';
            logger.debug(`[TTS CHUNKER - SARVAM] Splitting on word limit fallback: "${phrase}"`);
            this.audioQueue.push(phrase);
            this._processQueue();
        }
    }

    async _processQueue() {
        if (this.isProcessing || this.audioQueue.length === 0) return;
        this.isProcessing = true;

        try {
            while (this.audioQueue.length > 0) {
                const textToSynth = this.audioQueue.shift();
                const audioBase64 = await this.sarvam.synthesizeMulaw(textToSynth, this.languageCode, this.speaker, this.isWebCall);
                if (audioBase64) {
                    this.emit('audio', audioBase64);
                }
            }
        } finally {
            this.isProcessing = false;
        }
    }
}

export default SarvamService;
