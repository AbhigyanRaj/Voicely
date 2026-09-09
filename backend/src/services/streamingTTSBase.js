import EventEmitter from 'events';
import { chunkText, DEFAULTS, FIRST_CLAUSE } from './textChunker.js';
import { record } from '../utils/latencyMetrics.js';
import logger from '../utils/logger.js';

/**
 * Shared machinery for the streaming TTS adapters.
 *
 * Buffers LLM text, splits it into clauses, and synthesizes them. Subclasses
 * implement only `_synthesize`.
 *
 * Two behaviours here that the four hand-written adapters did not have:
 *
 *  - Requests are pipelined. Each adapter ran `while (queue.length) { await
 *    synth() }`, so clause N+1's request did not start until clause N's audio had
 *    fully downloaded. Since every provider adapter buffers a whole clause before
 *    returning a byte, that stacked one full round trip per clause. Up to
 *    `maxConcurrent` are now in flight while emission stays in sequence order.
 *
 *  - The first clause of a turn uses tighter split thresholds. Time-to-first-audio
 *    is the only thing that matters until audio is playing; after that the audio's
 *    own duration buys enough slack to prefer longer, better-sounding clauses.
 */
class StreamingTTSBase extends EventEmitter {
  /**
   * @param {object}  [options]
   * @param {'latency'|'quality'} [options.optimizeFor] quality drops comma splitting
   * @param {number}  [options.maxConcurrent] synthesis requests in flight
   * @param {string}  [options.metricLabel] suffix for the per-provider metrics
   */
  constructor({ optimizeFor = 'latency', maxConcurrent = 3, metricLabel = 'tts' } = {}) {
    super();
    this.optimizeFor = optimizeFor;
    this.maxConcurrent = Math.max(1, maxConcurrent);
    this.metricLabel = metricLabel;

    // `textBuffer` and `audioQueue` are named for compatibility: the media stream
    // controller reaches in and resets them directly on barge-in and on manual
    // intervention rather than calling clear().
    this.textBuffer = '';
    this.audioQueue = [];

    this._nextSeq = 0; // sequence number for the next clause enqueued
    this._emitSeq = 0; // sequence number of the next clause to emit
    this._ready = new Map(); // seq -> synthesized audio awaiting its turn
    this._inFlight = 0;
    this._pending = []; // clauses waiting for a concurrency slot
    this._generation = 0; // bumped on clear() to strand in-flight work
    this._firstClausePending = true;
  }

  /** Split options for the clause we are about to cut. */
  get _chunkConfig() {
    const base = this.optimizeFor === 'quality' ? { ...DEFAULTS, splitOnClause: false } : DEFAULTS;
    return this._firstClausePending ? { ...base, ...FIRST_CLAUSE } : base;
  }

  /** Receives streaming text from the LLM. */
  processTextChunk(chunk) {
    if (!chunk) return;
    this.textBuffer += chunk;

    // Drain repeatedly: one arriving token can complete more than one clause,
    // and the first-clause thresholds change once the first one is out.
    for (;;) {
      const { clauses, remainder } = chunkText(this.textBuffer, this._chunkConfig);
      if (clauses.length === 0) break;

      this.textBuffer = remainder;
      for (const clause of clauses) this._enqueue(clause);
    }
  }

  /** Called when the LLM stream has finished; emits whatever is left. */
  flush() {
    const tail = this.textBuffer.trim();
    this.textBuffer = '';
    if (tail.length > 0) this._enqueue(tail);
    // The next text to arrive belongs to a new turn.
    this._firstClausePending = true;
  }

  /**
   * Barge-in. Drops queued and in-flight work; audio already handed to the
   * transport cannot be recalled, which is what the transport's own `clear`
   * event is for.
   */
  clear() {
    this._generation += 1;
    this.textBuffer = '';
    this.audioQueue = [];
    this._pending = [];
    this._ready.clear();
    this._inFlight = 0;
    this._nextSeq = 0;
    this._emitSeq = 0;
    this._firstClausePending = true;
  }

  _enqueue(text) {
    const clause = text.trim();
    if (!clause) return;

    const seq = this._nextSeq++;
    this._pending.push({ seq, text: clause, queuedAt: performance.now() });
    // Mirrored for the controller's direct-reset path.
    this.audioQueue.push(clause);
    this._firstClausePending = false;
    this._pump();
  }

  /** Start as much synthesis as the concurrency limit allows. */
  _pump() {
    while (this._inFlight < this.maxConcurrent && this._pending.length > 0) {
      const item = this._pending.shift();
      this._inFlight += 1;
      this._run(item);
    }
  }

  async _run({ seq, text, queuedAt }) {
    const generation = this._generation;
    const startedAt = performance.now();
    record(`tts.queue_wait.${this.metricLabel}`, startedAt - queuedAt);

    let audio = null;
    try {
      audio = await this._synthesize(text);
    } catch (error) {
      logger.error(`[TTS ${this.metricLabel}] synthesis failed for "${text.slice(0, 40)}"`, error);
    }

    // Barge-in landed while this request was in flight: drop it silently.
    if (generation !== this._generation) return;

    const elapsed = performance.now() - startedAt;
    record(`tts.ttfb.${this.metricLabel}`, elapsed);
    logger.debug(
      `[TTS ${this.metricLabel}] seq ${seq} synthesized in ${elapsed.toFixed(1)}ms: "${text.slice(0, 40)}"`
    );

    this._inFlight -= 1;
    // Record even a failure so the sequence cursor is never stuck behind a hole.
    this._ready.set(seq, audio);
    this._drainReady();
    this._pump();
  }

  /** Emit every consecutive result available from the cursor onward. */
  _drainReady() {
    while (this._ready.has(this._emitSeq)) {
      const audio = this._ready.get(this._emitSeq);
      this._ready.delete(this._emitSeq);
      this._emitSeq += 1;

      if (this.audioQueue.length > 0) this.audioQueue.shift();
      if (audio) this.emit('audio', audio);
    }
  }

  /**
   * Synthesize one clause.
   * @abstract
   * @param {string} _text
   * @returns {Promise<object|string|null>} whatever shape the transport expects
   */
  async _synthesize(_text) {
    throw new Error(`${this.constructor.name} must implement _synthesize()`);
  }
}

export default StreamingTTSBase;
