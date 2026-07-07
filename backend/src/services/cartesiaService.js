import fetch from 'node-fetch';
import https from 'https';
import logger from '../utils/logger.js';

// Global keep-alive agent to eliminate TLS handshake latency on first TTFB
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 50
});

// Warm up the TCP/TLS connection immediately on backend startup
fetch('https://api.cartesia.ai/', { agent: httpsAgent }).catch(() => {});

class CartesiaService {
  constructor(apiKey = null) {
    this.apiKey = apiKey || process.env.CARTESIA_API_KEY;
    this.apiUrl = 'https://api.cartesia.ai/tts/bytes';
    this.version = '2024-06-10';

    if (!this.apiKey) {
      logger.warn('CARTESIA_API_KEY is not defined in environment variables and no API key provided.');
    }
  }

  /**
   * Synthesize text to speech using Cartesia REST API.
   * Requests 8000Hz pcm_mulaw natively for Twilio/Sandbox compatibility.
   *
   * @param {string} text - The text to synthesize
   * @param {string} voiceId - Cartesia Voice ID
   * @param {string} language - e.g., 'en'
   * @returns {Promise<Buffer|null>} The raw mulaw audio buffer, or null on error
   */
  async synthesizeMulaw(text, language = 'en', voiceId) {
    if (!this.apiKey) {
      logger.error('CARTESIA_API_KEY not configured.');
      return null;
    }

    const payload = {
      model_id: "sonic-3.5",
      transcript: text,
      voice: {
        mode: "id",
        id: voiceId
      },
      output_format: {
        container: "raw",
        encoding: "pcm_mulaw",
        sample_rate: 8000
      }
    };

    return this._fetchAudio(payload, text, voiceId);
  }

  /**
   * Synthesizes text to high-fidelity PCM audio (for Web Sandbox)
   */
  async synthesizePCM(text, language = 'en', voiceId, sampleRate = 24000) {
    if (!this.apiKey) {
      logger.error('CARTESIA_API_KEY not configured.');
      return null;
    }

    const payload = {
      model_id: "sonic-3.5",
      transcript: text,
      voice: {
        mode: "id",
        id: voiceId
      },
      output_format: {
        container: "raw",
        encoding: "pcm_f32le",
        sample_rate: sampleRate
      }
    };

    return this._fetchAudio(payload, text, voiceId);
  }

  async _fetchAudio(payload, text, voiceId) {
    try {
      if (!text || text.trim() === '') return null;

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        agent: httpsAgent,
        headers: {
          'X-API-Key': this.apiKey,
          'Cartesia-Version': this.version,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Cartesia API Error: ${response.status} - ${errText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);

    } catch (error) {
      logger.error('Cartesia Service Synthesis Error:', error);
      throw error;
    }
  }
}

export default CartesiaService;
