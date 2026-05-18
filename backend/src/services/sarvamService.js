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
    async synthesizeMulaw(text, languageCode = 'hi-IN', speaker = 'anushka') {
        if (!this.apiKey) {
            logger.error('SARVAM_API_KEY not found in environment');
            return null;
        }

        const startTotal = performance.now();
        logger.info(`[LATENCY TIMER] Starting Sarvam TTS synthesis for text: "${text}"`);

        try {
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
                    sampling_rate: 8000,
                    enable_preprocessing: true
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
            
            // 1. Downsample to 8000Hz for telephony standard
            wav.toSampleRate(8000);
            
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
    constructor(languageCode = 'hi-IN', speaker = 'anushka') {
        super();
        this.languageCode = languageCode;
        this.speaker = speaker;
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
        const boundaryTokens = /([।?!.]+\s+|,[\s]*)/;
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

        // 2. Low-Latency Trigger: Slice off word chunks early (4 words) to hide streaming delays
        const words = this.textBuffer.trim().split(/\s+/);
        if (words.length >= 5) {
            const phrase = words.slice(0, 4).join(' ');
            this.textBuffer = words.slice(4).join(' ') + ' '; // Put remaining back with a trailing space
            
            if (phrase.trim().length > 0) {
                logger.debug(`Low-latency trigger: Synthesizing early phrase chunk: "${phrase}"`);
                this.audioQueue.push(phrase.trim());
                this._processQueue();
            }
        }
    }

    async _processQueue() {
        if (this.isProcessing || this.audioQueue.length === 0) return;
        this.isProcessing = true;

        try {
            while (this.audioQueue.length > 0) {
                const textToSynth = this.audioQueue.shift();
                const audioBase64 = await this.sarvam.synthesizeMulaw(textToSynth, this.languageCode, this.speaker);
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
