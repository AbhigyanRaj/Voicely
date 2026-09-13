import StreamingCartesiaWS from './streamingCartesiaWS.js';
import StreamingCartesiaTTS from './streamingCartesiaTTS.js';
import logger from '../utils/logger.js';

/**
 * Build the TTS transport for a session.
 *
 * Prefers Cartesia's streaming WebSocket, which starts delivering audio ~119ms
 * after a clause is sent instead of ~633ms for the REST endpoint's first byte.
 * Falls back to REST if the socket cannot be established, so a Cartesia
 * WebSocket outage degrades latency rather than breaking the session.
 *
 * @param {object}  options
 * @param {string}  options.voiceId
 * @param {string}  options.language  Cartesia language code, e.g. 'hi'
 * @param {boolean} options.isWebCall
 * @param {string}  options.optimizeFor
 * @param {string?} options.apiKey
 * @returns {Promise<{tts: object, transport: 'websocket'|'rest'}>}
 */
export const createTTS = async ({ voiceId, language = 'en', isWebCall, optimizeFor, apiKey }) => {
  const streaming = new StreamingCartesiaWS({ voiceId, language, isWebCall, optimizeFor, apiKey });

  try {
    await streaming.connect();
    return { tts: streaming, transport: 'websocket' };
  } catch (err) {
    logger.warn(`Cartesia WebSocket unavailable, falling back to REST: ${err.message}`);
    streaming.close();
    return {
      tts: new StreamingCartesiaTTS(voiceId, isWebCall, optimizeFor, apiKey, language),
      transport: 'rest',
    };
  }
};

export default { createTTS };
