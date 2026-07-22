import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import EventEmitter from 'events';
import logger from '../utils/logger.js';

class DeepgramService extends EventEmitter {
  constructor(apiKey = null) {
    super();
    this.deepgram = null;
    this.connection = null;
    this.isConnected = false;
    this.apiKey = apiKey || process.env.DEEPGRAM_API_KEY;

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
      endpointing: 300, // Faster endpointing to confirm speech quicker
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

      // Set up event listeners
      this.connection.on(LiveTranscriptionEvents.Open, () => {
        this.isConnected = true;
        logger.success('Deepgram connection opened');
        this.emit('connected');
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

          const type = transcriptData.isFinal ? 'FINAL' : 'PARTIAL';
          logger.debug(`Transcript [${type}]: "${transcriptData.text}" (${(transcriptData.confidence * 100).toFixed(0)}%)`);

          // Emit different events for partial and final transcripts
          if (transcriptData.isFinal || transcriptData.speechFinal) {
            this.emit('finalTranscript', transcriptData);
          } else {
            this.emit('partialTranscript', transcriptData);
          }

          this.emit('transcript', transcriptData);
        }
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
    if (!this.connection || !this.isConnected) {
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
