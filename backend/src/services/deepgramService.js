import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import EventEmitter from 'events';
import { record } from '../utils/latencyMetrics.js';
import logger from '../utils/logger.js';

// How long to wait for Deepgram's socket before giving up on the session.
const OPEN_TIMEOUT_MS = 5000;
// Frames buffered while the socket opens. At 32ms per frame this is ~3s, far
// more than a handshake needs, and it is bounded so a stuck socket can't grow
// it without limit.
const MAX_PENDING_FRAMES = 100;

class DeepgramService extends EventEmitter {
  constructor(apiKey = null) {
    super();
    this.deepgram = null;
    this.connection = null;
    this.isConnected = false;
    this.apiKey = apiKey || process.env.DEEPGRAM_API_KEY;
    this.pendingAudio = [];
    this.lastAudioAt = null;
    this.sawFirstPartial = false;

    if (!this.apiKey) {
      logger.error('DEEPGRAM_API_KEY not found in environment variables and no API key provided');
    }
  }

  /**
   * Initialize Deepgram client
   */
  initialize() {
    if (!this.apiKey) {
      throw new Error('Deepgram API key is required');
    }

    this.deepgram = createClient(this.apiKey);
    logger.debug('Deepgram client initialized');
  }

  /**
   * Create a live transcription connection
   * @param {Object} options - Connection options
   * @returns {Object} - Live transcription connection
   */
  async createLiveConnection(options = {}) {
    if (!this.deepgram) {
      this.initialize();
    }

    const defaultOptions = {
      model: 'nova-2-phonecall', // Optimized for telephony
      language: 'en-US',
      smart_format: true,
      interim_results: true, // Get partial transcripts
      endpointing: 150, // Wait this long on silence before finalizing
      no_delay: true, // Don't pad before finalizing
      utterance_end_ms: '1000', // Safety net to force finalize even with background noise
      encoding: 'mulaw',
      sample_rate: 8000,
      channels: 1,
      punctuate: true,
      // Keyword boosting for better accuracy on common responses
      keywords: ['yes:2', 'no:2', 'maybe:2', 'sure:2', 'okay:2', 'interested:2', 'not interested:2'],
    };

    const connectionOptions = { ...defaultOptions, ...options };

    try {
      this.connection = this.deepgram.listen.live(connectionOptions);

      // Resolves when the socket is genuinely usable. Without this,
      // createLiveConnection returned the instant listen.live() was called, so
      // callers announced readiness and then had every frame silently dropped by
      // sendAudio until `isConnected` flipped -- losing the user's first word.
      const opened = new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Deepgram did not open within ${OPEN_TIMEOUT_MS}ms`)),
          OPEN_TIMEOUT_MS
        );

        this.connection.on(LiveTranscriptionEvents.Open, () => {
          clearTimeout(timer);
          this.isConnected = true;
          logger.success('Deepgram connection opened');

          // Replay anything captured while the handshake was in flight.
          const buffered = this.pendingAudio;
          this.pendingAudio = [];
          for (const frame of buffered) {
            try {
              this.connection.send(frame);
            } catch (error) {
              logger.error('Error replaying buffered audio to Deepgram', error);
            }
          }
          if (buffered.length > 0) {
            logger.debug(`Replayed ${buffered.length} audio frame(s) buffered during handshake`);
          }

          this.emit('connected');
          resolve(this.connection);
        });

        this.connection.on(LiveTranscriptionEvents.Error, (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });

      this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel?.alternatives?.[0];
        if (transcript && transcript.transcript) {
          const transcriptData = {
            text: transcript.transcript,
            confidence: transcript.confidence,
            isFinal: data.is_final,
            speechFinal: data.speech_final,
            words: transcript.words || []
          };

          // Time from the audio that opened this utterance to the first text
          // back. Measured once per utterance, not per interim result.
          if (!this.sawFirstPartial && this.lastAudioAt !== null) {
            this.sawFirstPartial = true;
            record('stt.first_partial', performance.now() - this.lastAudioAt);
          }

          const type = transcriptData.isFinal ? 'FINAL' : 'PARTIAL';
          logger.debug(`Transcript [${type}]: "${transcriptData.text}" (${(transcriptData.confidence * 100).toFixed(0)}%)`);

          // Emit different events for partial and final transcripts
          if (transcriptData.isFinal || transcriptData.speechFinal) {
            this.sawFirstPartial = false; // next utterance measures afresh
            this.emit('finalTranscript', transcriptData);
          } else {
            this.emit('partialTranscript', transcriptData);
          }

          this.emit('transcript', transcriptData);
        }
      });

      // Deepgram's own end-of-utterance signal. Nothing subscribed to this
      // before, which is why the application had to run a second endpointer.
      this.connection.on(LiveTranscriptionEvents.UtteranceEnd, (data) => {
        this.emit('utteranceEnd', data);
      });

      this.connection.on(LiveTranscriptionEvents.Metadata, (data) => {
        logger.debug('Deepgram metadata received', data);
        this.emit('metadata', data);
      });

      this.connection.on(LiveTranscriptionEvents.Error, (error) => {
        logger.error('Deepgram service error', error);
        this.emit('error', error);
      });

      this.connection.on(LiveTranscriptionEvents.Close, () => {
        this.isConnected = false;
        logger.info('Deepgram connection closed');
        this.emit('disconnected');
      });

      await opened;
      return this.connection;
    } catch (error) {
      logger.error('Failed to create Deepgram connection', error);
      throw error;
    }
  }

  /**
   * Send audio data to Deepgram
   * @param {Buffer} audioData - Audio data buffer (mulaw, 8kHz)
   */
  sendAudio(audioData) {
    this.lastAudioAt = performance.now();

    // Buffer rather than discard while the socket is still opening. This is the
    // window that used to eat the caller's first word.
    if (!this.connection || !this.isConnected) {
      if (this.pendingAudio.length < MAX_PENDING_FRAMES) {
        this.pendingAudio.push(audioData);
      }
      return;
    }

    try {
      this.connection.send(audioData);
    } catch (error) {
      logger.error('Error sending audio to Deepgram', error);
      this.emit('error', error);
    }
  }

  /**
   * Close the Deepgram connection
   */
  close() {
    this.pendingAudio = [];
    if (this.connection) {
      try {
        this.connection.finish();
        this.isConnected = false;
        logger.debug('Deepgram connection closed gracefully');
      } catch (error) {
        logger.error('Error closing Deepgram connection', error);
      }
    }
  }

  /**
   * Check if connection is active
   */
  isActive() {
    return this.isConnected;
  }
}

export default DeepgramService;
