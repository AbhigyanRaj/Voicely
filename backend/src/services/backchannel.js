import { languageKey } from '../config/languages.js';

/**
 * The short sound a person makes while you are still finishing your sentence.
 *
 * Measured, our whole turn is ~250ms, but Deepgram spends roughly 460ms deciding
 * the speaker has stopped -- so most of the silence a caller feels happens before
 * we are even allowed to begin. Making the pipeline faster cannot touch it.
 *
 * A person does not wait. They say "हाँ" over the tail of your sentence and then
 * answer. That overlap is not rudeness; it is the thing that makes a conversation
 * feel like one. This speaks into that window, which is the only lever that
 * reaches the 460ms at all.
 *
 * It is deliberately NOT counted as the agent speaking. See `noteAgentAudio` and
 * `firstAudioSent` in mediaStreamController: if a backchannel were treated as
 * ordinary reply audio it would (a) make turn.mouth_to_ear measure the filler
 * instead of the reply, so we would appear to have halved latency by measuring
 * something else, and (b) make the caller's own continuing speech look like a
 * barge-in, which aborts the speculation this exists to cover for.
 */

/**
 * Per language. Short, neutral, and meaning roughly "I'm listening" -- never
 * agreement, because the agent has not heard the whole sentence yet and must not
 * appear to accept something it has not been told.
 */
const TOKENS = {
  hi: ['हाँ', 'जी', 'अच्छा', 'हम्म'],
  mr: ['हो', 'बरं', 'हम्म'],
  ta: ['ஆமா', 'சரி', 'ம்ம்'],
  te: ['అవును', 'సరే', 'హ్మ్'],
  bn: ['হ্যাঁ', 'আচ্ছা', 'হুম'],
  'en-US': ['Mm-hmm', 'Right', 'I see', 'Okay'],
};

/**
 * How long an interim transcript must stand unchanged before we believe the
 * caller has finished. Below this we are interrupting a pause mid-sentence;
 * above it we have spent the window we were trying to fill.
 */
export const STABLE_FOR_MS = 260;

/** Never twice in one turn -- a second one reads as a stutter, not a listener. */
export class Backchannel {
  constructor({ language = 'en-US' } = {}) {
    this.tokens = TOKENS[languageKey(language)] || TOKENS['en-US'];
    this.lastIndex = -1;
    this.firedThisTurn = false;
    this.lastNormalized = null;
  }

  /** A new turn: the caller has started speaking again. */
  reset() {
    this.firedThisTurn = false;
    this.lastNormalized = null;
  }

  /**
   * Note an interim transcript. Returns true if the silence clock should restart.
   *
   * The caller owns the timer, and it has to be a timer rather than a check on
   * each new partial: partials STOP arriving the moment someone stops talking, so
   * "the text has not changed for 260ms" can never be observed by waiting for
   * another partial to compare against. The first version of this did exactly
   * that and consequently never fired once.
   */
  noteInterim(normalized) {
    if (!normalized || this.firedThisTurn) return false;
    if (normalized === this.lastNormalized) return false;
    this.lastNormalized = normalized;
    return true;
  }

  /**
   * The non-timing gates, checked when the silence timer expires rather than
   * when it was armed -- the agent may have started speaking in between.
   *
   * @param {object}  o
   * @param {boolean} o.speculationInFlight  a reply is already being generated
   * @param {boolean} o.agentSpeaking        the agent has audio playing
   */
  canFire({ speculationInFlight, agentSpeaking }) {
    if (this.firedThisTurn) return false;
    // Talking over our own reply is a collision, not a backchannel.
    if (agentSpeaking) return false;
    // With no reply being generated there is no wait to cover, and acknowledging
    // half a sentence is worse than staying quiet.
    if (!speculationInFlight) return false;
    return Boolean(this.lastNormalized);
  }

  /**
   * The token to speak, marked as fired. Never repeats the previous one -- the
   * same syllable twice running is the tell that it is canned.
   */
  take() {
    this.firedThisTurn = true;
    if (this.tokens.length === 1) return this.tokens[0];

    let index;
    do {
      index = Math.floor(Math.random() * this.tokens.length);
    } while (index === this.lastIndex);
    this.lastIndex = index;
    return this.tokens[index];
  }
}

export { TOKENS };
export default Backchannel;
