import StreamingTTSBase from './streamingTTSBase.js';
import CartesiaService from './cartesiaService.js';

/**
 * Cartesia Sonic adapter.
 *
 * Clause splitting, request pipelining and latency metrics all live in
 * StreamingTTSBase; this only knows how to turn one clause into audio.
 */
class StreamingCartesiaTTS extends StreamingTTSBase {
    constructor(
        voiceId = '79a125e8-cd45-4c13-8a67-188112f4dd22',
        isWebCall = false,
        optimizeFor = 'latency',
        apiKey = null,
        language = 'en'
    ) {
        super({ optimizeFor, metricLabel: 'cartesia' });
        this.voiceId = voiceId;
        this.isWebCall = isWebCall;
        this.language = language;
        this.cartesiaService = new CartesiaService(apiKey);
    }

    async _synthesize(text) {
        if (this.isWebCall) {
            // 24 kHz float PCM for the browser sandbox.
            const audioBuffer = await this.cartesiaService.synthesizePCM(text, this.language, this.voiceId, 24000);
            if (!audioBuffer) return null;
            return {
                payload: audioBuffer.toString('base64'),
                encoding: 'pcm_f32le',
                sampleRate: 24000,
            };
        }

        // 8 kHz mulaw for telephony.
        const audioBuffer = await this.cartesiaService.synthesizeMulaw(text, this.language, this.voiceId);
        if (!audioBuffer) return null;
        return {
            payload: audioBuffer.toString('base64'),
            encoding: 'mulaw',
            sampleRate: 8000,
        };
    }
}

export default StreamingCartesiaTTS;
