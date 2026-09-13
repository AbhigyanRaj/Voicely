import logger from '../utils/logger.js';

/**
 * Decides when the user has actually interrupted the agent.
 *
 * The rule this replaces was `data.text.trim().length > 1` on any interim
 * transcript: two characters, once, with no check on energy, on confidence, or
 * even on whether the agent was speaking. It fired on a stray "uh" while the
 * agent was idle, which sent a spurious `clear` and reset the handler's state --
 * and Deepgram emits plenty of one-word interims from room tone alone.
 *
 * Four gates, cheapest first:
 *
 *   1. The agent must actually be speaking. This alone removes every barge-in
 *      that had nothing to interrupt.
 *   2. Enough words to be a sentence rather than a noise artifact. Three words
 *      is unambiguous and fires at once; two words waits for a second interim
 *      agreeing with it, which costs one interim (~150ms) on a genuine
 *      interrupt and rejects most one-shot flukes.
 *   3. Confidence, because Deepgram reports its own uncertainty and a
 *      hallucinated phrase usually scores badly.
 *   4. Input energy above the noise floor. This is aimed at transcripts
 *      hallucinated from near-silence, not at coughs -- a cough is loud, and is
 *      rejected by the word gate instead.
 */

/** Fires immediately: nobody says three words by accident. */
const DECISIVE_WORDS = 3;
/** Fires only once a second interim agrees. */
const MIN_WORDS = 2;
/** While the agent is introducing itself, only a decisive interrupt counts. */
const GREETING_MIN_WORDS = DECISIVE_WORDS;
/** Deepgram's own confidence in the interim. */
const MIN_CONFIDENCE = 0.5;
/**
 * RMS of the incoming audio, 0..1. A quiet room sits around 0.002 and speech at
 * arm's length around 0.05, so this is comfortably below speech and well above
 * silence.
 */
const MIN_RMS = 0.008;
/**
 * How far back to look for speech energy.
 *
 * Measured against real synthesized speech, only 70-83% of 20ms frames clear the
 * threshold -- the rest are the gaps between words. Gating on the single most
 * recent frame therefore vetoed any interrupt whose transcript happened to land
 * in one of those gaps, which is most of them. Taking the loudest frame in the
 * recent past instead asks the question that actually matters: has there been
 * speech lately, not is there speech in this exact 20 milliseconds.
 */
const RMS_WINDOW_MS = 300;
/** How long a two-word candidate stays eligible for confirmation. */
const CANDIDATE_TTL_MS = 1200;
/**
 * A barge-in followed by no further speech at all within this window did not
 * interrupt anything. Counted, so the false-positive rate is a number rather
 * than an impression.
 *
 * "Further speech" means any transcript, interim included -- not just a
 * completed one. Waiting for a final made a long sentence look spurious: the
 * barge-in fires on the first interims, and someone who then talks for three
 * seconds has no final to show at the 1.5s mark despite obviously still
 * speaking. That miscounted 3 of 7 genuine interrupts in an 8-turn run.
 */
const SPURIOUS_AFTER_MS = 1500;

const wordCount = (text) => {
  const trimmed = (text || '').trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
};

class BargeInDetector {
  /**
   * @param {(ms: number) => void} [onSpurious] called when a triggered barge-in
   *   turned out not to be followed by speech.
   */
  constructor({ onSpurious = null } = {}) {
    // When the audio already handed to the client finishes playing, on the
    // client's clock. The server knows every frame's duration, so it can model
    // the same playout schedule the browser runs rather than guess.
    this.agentAudioUntil = 0;
    // Recent input energy: {at, rms} for the last RMS_WINDOW_MS of frames.
    this.rmsWindow = [];
    // A two-word candidate waiting for a second interim to agree.
    this.candidateAt = null;
    this.triggered = 0;
    this.spurious = 0;
    this._spuriousTimer = null;
    this._onSpurious = onSpurious;
  }

  /** True when audio already sent is still playing on the client. */
  isAgentSpeaking(now = performance.now()) {
    return now < this.agentAudioUntil;
  }

  /**
   * Account for one outgoing audio frame.
   *
   * Mirrors the client's scheduler: a frame either extends the tail of what is
   * already queued or, if the queue has drained, starts from now.
   */
  noteAgentAudio(byteLength, encoding, sampleRate, now = performance.now()) {
    const bytesPerSample = encoding === 'pcm_f32le' ? 4 : encoding === 'pcm_s16le' ? 2 : 1;
    const durationMs = (byteLength / bytesPerSample / sampleRate) * 1000;
    if (!Number.isFinite(durationMs) || durationMs <= 0) return;
    this.agentAudioUntil = Math.max(this.agentAudioUntil, now) + durationMs;
  }

  /** The agent stopped: barge-in has nothing left to interrupt. */
  noteAgentSilent(now = performance.now()) {
    this.agentAudioUntil = now;
    this.candidateAt = null;
  }

  /**
   * Energy of one inbound audio frame.
   *
   * Computed here rather than sent by the client so that every client -- the
   * browser, the measurement harness, a telephony leg -- is gated identically,
   * with no protocol change and nothing to trust from the far end.
   */
  noteInputFrame(buffer, encoding, now = performance.now()) {
    const rms = frameRms(buffer, encoding);
    if (rms === null) return;

    this.rmsWindow.push({ at: now, rms });
    // Bounded by time, and by count as a backstop in case frames arrive faster
    // than real time -- a harness replaying audio, or a burst after a stall.
    const cutoff = now - RMS_WINDOW_MS;
    while (this.rmsWindow.length > 0 && this.rmsWindow[0].at < cutoff) this.rmsWindow.shift();
    if (this.rmsWindow.length > 64) this.rmsWindow.splice(0, this.rmsWindow.length - 64);
  }

  /**
   * Loudest frame in the recent window, or null if nothing recent was measured.
   * The peak rather than the mean: one clearly-spoken word inside the window is
   * speech, however much silence surrounds it.
   */
  recentPeakRms(now = performance.now()) {
    const cutoff = now - RMS_WINDOW_MS;
    let peak = null;
    for (const sample of this.rmsWindow) {
      if (sample.at < cutoff) continue;
      if (peak === null || sample.rms > peak) peak = sample.rms;
    }
    return peak;
  }

  /**
   * Should this interim transcript interrupt the agent?
   *
   * @param {{text: string, confidence?: number}} data
   * @param {{isGreeting?: boolean, now?: number}} [context]
   * @returns {{barge: boolean, reason: string}}
   */
  evaluate(data, { isGreeting = false, now = performance.now() } = {}) {
    if (!this.isAgentSpeaking(now)) {
      this.candidateAt = null;
      return { barge: false, reason: 'agent_idle' };
    }

    const words = wordCount(data?.text);
    const decisiveAt = isGreeting ? GREETING_MIN_WORDS : DECISIVE_WORDS;
    const minWords = isGreeting ? GREETING_MIN_WORDS : MIN_WORDS;

    if (words < minWords) return { barge: false, reason: 'too_short' };

    const confidence = data?.confidence;
    if (typeof confidence === 'number' && confidence < MIN_CONFIDENCE) {
      return { barge: false, reason: 'low_confidence' };
    }

    // Only trust the energy reading if it is recent; a stale one says nothing
    // about what is being said now. No reading at all (mulaw, or a client that
    // has not sent audio yet) leaves this gate open rather than closed.
    const peak = this.recentPeakRms(now);
    if (peak !== null && peak < MIN_RMS) {
      return { barge: false, reason: 'below_noise_floor' };
    }

    if (words >= decisiveAt) {
      this.candidateAt = null;
      return { barge: true, reason: 'decisive' };
    }

    // Two words: wait for a second interim that also clears the gates.
    if (this.candidateAt !== null && now - this.candidateAt <= CANDIDATE_TTL_MS) {
      this.candidateAt = null;
      return { barge: true, reason: 'sustained' };
    }
    this.candidateAt = now;
    return { barge: false, reason: 'awaiting_confirmation' };
  }

  /** Record that a barge-in fired, and start watching for it being spurious. */
  noteTriggered(now = performance.now()) {
    this.triggered += 1;
    this.candidateAt = null;
    this.agentAudioUntil = now;
    if (this._spuriousTimer) clearTimeout(this._spuriousTimer);
    this._spuriousTimer = setTimeout(() => {
      this._spuriousTimer = null;
      this.spurious += 1;
      logger.debug('Barge-in was not followed by speech; counted as spurious');
      this._onSpurious?.(SPURIOUS_AFTER_MS);
    }, SPURIOUS_AFTER_MS);
  }

  /**
   * Evidence that the user really is speaking, which clears the last barge-in of
   * suspicion. Any transcript counts, interim included.
   */
  noteSpeechConfirmed() {
    if (this._spuriousTimer) {
      clearTimeout(this._spuriousTimer);
      this._spuriousTimer = null;
    }
  }

  dispose() {
    if (this._spuriousTimer) clearTimeout(this._spuriousTimer);
    this._spuriousTimer = null;
  }
}

/**
 * RMS of one audio frame, 0..1, or null if the encoding is not one we can read.
 * mu-law is left alone: decoding it per frame costs more than the gate is worth,
 * and telephony legs have their own noise characteristics anyway.
 */
export function frameRms(buffer, encoding) {
  if (!buffer || buffer.length < 2) return null;
  if (encoding !== 'linear16') return null;

  let sumSquares = 0;
  const samples = Math.floor(buffer.length / 2);
  if (samples === 0) return null;
  for (let i = 0; i < samples; i++) {
    const sample = buffer.readInt16LE(i * 2) / 32768;
    sumSquares += sample * sample;
  }
  return Math.sqrt(sumSquares / samples);
}

export { DECISIVE_WORDS, MIN_WORDS, MIN_CONFIDENCE, MIN_RMS, RMS_WINDOW_MS, SPURIOUS_AFTER_MS };
export default BargeInDetector;
