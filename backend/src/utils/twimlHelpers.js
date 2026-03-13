import twilio from 'twilio';
import logger from '../utils/logger.js';

/**
 * Helper functions for Twilio TwiML generation
 */

// Create TwiML response helper
export function createTwiMLResponse() {
  return new twilio.twiml.VoiceResponse();
}

/**
 * Add Media Stream to TwiML for real-time transcription
 * @param {VoiceResponse} twiml - Twilio VoiceResponse object
 * @param {string} callSid - Twilio Call SID
 * @param {Object} options - Stream options
 */
export function addMediaStream(twiml, callSid, options = {}) {
  // Priority: NGROK_URL (local dev) > TUNNEL_URL (local dev) > BASE_URL (production/render)
  const baseUrl = process.env.NGROK_URL || process.env.TUNNEL_URL || process.env.BASE_URL || 'http://localhost:5001';

  // Ensure the URL uses the ws/wss protocol for the stream
  const streamUrl = `${baseUrl.replace(/^http/, 'ws')}/api/streams/twilio`;

  logger.info(`Added Media Stream to TwiML: ${streamUrl} (CallSid: ${callSid})`);

  const connect = twiml.connect();
  connect.stream({ url: streamUrl });
}

/**
 * Create TwiML with streaming enabled
 * @param {string} callSid - Twilio Call SID
 * @param {boolean} enableStreaming - Whether to enable streaming
 */
export function createStreamingTwiMLResponse(callSid, enableStreaming = true) {
  const twiml = new twilio.twiml.VoiceResponse();

  if (enableStreaming && callSid) {
    addMediaStream(twiml, callSid);
  }

  return twiml;
}

// Export for CommonJS compatibility if needed
export default {
  createTwiMLResponse,
  addMediaStream,
  createStreamingTwiMLResponse
};
