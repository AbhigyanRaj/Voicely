import EventEmitter from 'events';
import WebSocket from 'ws';
import { chunkText, DEFAULTS, FIRST_CLAUSE } from './textChunker.js';
import { record } from '../utils/latencyMetrics.js';
import logger from '../utils/logger.js';

const CARTESIA_VERSION = '2024-06-10';
const MODEL_ID = 'sonic-3.5';
const CONNECT_TIMEOUT_MS = 4000;

/**
 * Cartesia TTS over its streaming WebSocket.
 *
 * The REST endpoint (`/tts/bytes`) returns nothing until the whole clause is
 * synthesized. Measured on the same sentence: REST produced its first byte at
 * 633ms, while the WebSocket delivered its first audio chunk 119ms after the
 * request went out. Since TTS is the last hop before the user hears anything,
 * that difference lands directly on perceived latency.
 *
 * Two further wins from holding one socket per session:
 *  - No per-clause connection cost. Opening the socket takes ~200ms, which is
 *    paid once during session setup, behind Deepgram's own handshake.
 *  - Clauses share a `context_id` with `continue: true`, so Cartesia carries
 *    prosody across them instead of treating each as a standalone phrase.
 */
class StreamingCartesiaWS extends EventEmitter {
  /**
   * @param {object}  options
   * @param {string}  options.voiceId
   * @param {boolean} [options.isWebCall] wideband PCM for browsers, mulaw for telephony
   * @param {'latency'|'quality'} [options.optimizeFor]
   * @param {string}  [options.apiKey]
   */
  constructor({ voiceId, language = 'en', isWebCall = false, optimizeFor = 'latency', apiKey = null } = {}) {
    super();
    this.voiceId = voiceId;
    // Cartesia infers pronunciation from this, not from the script of the text.
    // Without it Devanagari is read as if it were English and comes out as noise.
    this.language = language;
    this.isWebCall = isWebCall;
    this.optimizeFor = optimizeFor;
    this.apiKey = apiKey || process.env.CARTESIA_API_KEY;

    this.outputFormat = isWebCall
      ? { container: 'raw', encoding: 'pcm_f32le', sample_rate: 24000 }
      : { container: 'raw', encoding: 'pcm_mulaw', sample_rate: 8000 };
    this.clientEncoding = isWebCall ? 'pcm_f32le' : 'mulaw';
    this.sampleRate = this.outputFormat.sample_rate;

    this.textBuffer = '';
    // Kept for the media controller, which resets these directly on barge-in.
    this.audioQueue = [];

    this.ws = null;
    this.ready = null;
    this.closed = false;
    this._firstClausePending = true;
    // Bumped on barge-in. Chunks tagged with a stale context are discarded, so
    // no cancel round-trip is needed.
    this._contextSeq = 0;
    this._utteranceStartedAt = null;
    this._sawFirstChunkThisUtterance = false;
    this._awaitingNewUtterance = true;
  }

  get _contextId() {
    return `ctx-${this._contextSeq}`;
  }

  get _chunkConfig() {
    const base = this.optimizeFor === 'quality' ? { ...DEFAULTS, splitOnClause: false } : DEFAULTS;
    return this._firstClausePending ? { ...base, ...FIRST_CLAUSE } : base;
  }

  /**
   * Open the socket. Call during session setup so the ~200ms handshake overlaps
   * work that is happening anyway.
   * @returns {Promise<void>} rejects if the socket cannot be established
   */
  connect() {
    if (this.ready) return this.ready;
    if (!this.apiKey) return Promise.reject(new Error('CARTESIA_API_KEY is not configured'));

    this.ready = new Promise((resolve, reject) => {
      const url =
        `wss://api.cartesia.ai/tts/websocket` +
        `?api_key=${encodeURIComponent(this.apiKey)}&cartesia_version=${CARTESIA_VERSION}`;

      const socket = new WebSocket(url);
      this.ws = socket;

      const timer = setTimeout(() => {
        reject(new Error(`Cartesia socket did not open within ${CONNECT_TIMEOUT_MS}ms`));
        socket.terminate();
      }, CONNECT_TIMEOUT_MS);

      socket.on('open', () => {
        clearTimeout(timer);
        logger.debug('Cartesia TTS socket open');
        resolve();
      });

      socket.on('message', (raw) => this._onMessage(raw));

      socket.on('error', (err) => {
        clearTimeout(timer);
        logger.error('Cartesia TTS socket error', err);
        reject(err);
      });

      socket.on('close', () => {
        this.ws = null;
        // A mid-session drop means the rest of this turn has no audio. Surfaced
        // so the caller can fall back rather than going silent.
        if (!this.closed) {
          logger.warn('Cartesia TTS socket closed mid-session');
          this.emit('transportClosed');
        }
      });
    });

    return this.ready;
  }

  _onMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Drop anything from a context abandoned by barge-in.
    if (message.context_id && message.context_id !== this._contextId) return;

    if (message.type === 'chunk' && message.data) {
      if (!this._sawFirstChunkThisUtterance && this._utteranceStartedAt !== null) {
        this._sawFirstChunkThisUtterance = true;
        record('tts.ttfb.cartesia_ws', performance.now() - this._utteranceStartedAt);
      }
      // Already base64 on the wire, and the client wants base64: pass it through
      // rather than decoding and re-encoding.
      this.emit('audio', {
        payload: message.data,
        encoding: this.clientEncoding,
        sampleRate: this.sampleRate,
      });
      return;
    }

    if (message.type === 'error') {
      logger.error(`Cartesia TTS error: ${message.error || JSON.stringify(message)}`);
      this.emit('transportError', new Error(message.error || 'Cartesia TTS error'));
    }
  }

  /** Receives streaming text from the LLM. */
  processTextChunk(chunk) {
    if (!chunk) return;
    this.textBuffer += chunk;

    for (;;) {
      const { clauses, remainder } = chunkText(this.textBuffer, this._chunkConfig);
      if (clauses.length === 0) break;
      this.textBuffer = remainder;
      for (const clause of clauses) this._send(clause, true);
    }
  }

  /** Called when the LLM stream has finished. */
  flush() {
    const tail = this.textBuffer.trim();
    this.textBuffer = '';
    if (tail.length > 0) this._send(tail, false);
    else this._send('', false); // closes the context so Cartesia emits `done`
    this._firstClausePending = true;
  }

  /** Barge-in: abandon the current context so its remaining chunks are ignored. */
  clear() {
    this.textBuffer = '';
    this.audioQueue = [];
    this._contextSeq += 1;
    this._firstClausePending = true;
    this._utteranceStartedAt = null;
    this._sawFirstChunkThisUtterance = false;
    this._awaitingNewUtterance = true;
  }

  /**
   * Speak something that is not part of the reply.
   *
   * Used for the backchannel -- the short sound spoken while the caller is still
   * finishing. Three things make this different from an ordinary clause:
   *
   *  - `continue: true` is mandatory. A false continuation closes the context
   *    while `_contextSeq` stays put, so the real reply would then stream into a
   *    context Cartesia has already finished.
   *  - It must not claim `_utteranceStartedAt`, or tts.ttfb would measure the
   *    filler rather than the reply it was covering for.
   *  - It must not consume the first-clause fast path, which belongs to the real
   *    reply's opening words.
   */
  speakAside(text) {
    const socket = this.ws;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (!text) return;

    try {
      socket.send(
        JSON.stringify({
          model_id: MODEL_ID,
          transcript: text,
          language: this.language,
          voice: { mode: 'id', id: this.voiceId },
          output_format: this.outputFormat,
          context_id: this._contextId,
          continue: true,
        })
      );
    } catch (err) {
      logger.debug(`Failed to send aside to Cartesia: ${err.message}`);
    }
  }

  _send(text, shouldContinue) {
    const socket = this.ws;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      logger.warn('Cartesia TTS socket not open; dropping clause');
      return;
    }

    // Start the clock on the first clause of an utterance. It has to survive
    // flush(), because the chunks for the final clause arrive after it -- nulling
    // it there meant the first-chunk measurement never fired at all.
    if (this._awaitingNewUtterance) {
      this._awaitingNewUtterance = false;
      this._utteranceStartedAt = performance.now();
      this._sawFirstChunkThisUtterance = false;
    }

    try {
      socket.send(
        JSON.stringify({
          model_id: MODEL_ID,
          transcript: text,
          language: this.language,
          voice: { mode: 'id', id: this.voiceId },
          output_format: this.outputFormat,
          context_id: this._contextId,
          continue: shouldContinue,
        })
      );
    } catch (err) {
      logger.error('Failed to send clause to Cartesia', err);
    }

    if (!shouldContinue) {
      // Utterance closed. The next clause to arrive begins a new measurement,
      // but the current timer stays valid until then.
      this._awaitingNewUtterance = true;
    }
  }

  close() {
    this.closed = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* already gone */
      }
      this.ws = null;
    }
  }
}

export default StreamingCartesiaWS;
