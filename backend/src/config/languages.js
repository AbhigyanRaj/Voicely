/**
 * The languages a session can run in, and what each provider needs to be told.
 *
 * One table so STT, TTS, the greeting cache and the UI can never disagree about
 * what "hi" means. Before this, English was hardcoded in four separate places
 * (the Deepgram config, the greeting synthesizer, the Cartesia payload and the
 * frontend voice list) and changing language meant finding all four.
 *
 * Model choice is verified against Deepgram's models API by CANONICAL name, not
 * display name: several unrelated models are all displayed as "general", and
 * reading the display name suggests these languages sit on an older generation
 * than they do. They do not -- `nova-3` covers every language below.
 */

/**
 * English keeps `nova-2-phonecall` rather than moving to nova-3 with the rest.
 * Not principle, just evidence: the measured 757ms p50 baseline was taken on it,
 * and swapping the model under the benchmark would make any regression
 * unattributable. Measure nova-3 for English separately, then switch if it wins.
 */
const ENGLISH_STT_MODEL = process.env.DEEPGRAM_MODEL || 'nova-2-phonecall';

/**
 * @typedef {object} LanguageSpec
 * @property {string} label      English name, for logs and the picker
 * @property {string} native     The language's own name, in its own script
 * @property {string} sttModel   Deepgram `model` parameter
 * @property {string} sttLang    Deepgram `language` parameter
 * @property {string} ttsLang    Cartesia `language` parameter
 * @property {string} voiceId    Default Cartesia voice
 * @property {boolean} rtl       Right-to-left script
 */

/** @type {Record<string, LanguageSpec>} */
export const LANGUAGES = {
  'en-US': {
    label: 'English',
    native: 'English',
    sttModel: ENGLISH_STT_MODEL,
    sttLang: 'en-US',
    ttsLang: 'en',
    // Cartesia "Kendra".
    voiceId: '79a125e8-cd45-4c13-8a67-188112f4dd22',
    rtl: false,
  },
  hi: {
    label: 'Hindi',
    native: 'हिन्दी',
    sttModel: 'nova-3',
    sttLang: 'hi',
    ttsLang: 'hi',
    // "Ishani - Thoughtful Responder". Calm and unhurried, which is what a
    // reminder call needs -- an upbeat sales voice reads as pressure when the
    // subject is money someone does not have.
    voiceId: '14008c51-fbf4-418e-ae23-9316a03dcfa2',
    rtl: false,
  },
  ta: {
    label: 'Tamil',
    native: 'தமிழ்',
    sttModel: 'nova-3',
    sttLang: 'ta',
    ttsLang: 'ta',
    // "Janani - Calm Professional".
    voiceId: 'fb7d8d97-9730-4165-bd79-36b5ce61b5f2',
    rtl: false,
  },
  te: {
    label: 'Telugu',
    native: 'తెలుగు',
    sttModel: 'nova-3',
    sttLang: 'te',
    ttsLang: 'te',
    // "Shanti - Calm Authority".
    voiceId: '4418bb06-8329-49a1-bb11-53bb64ca0547',
    rtl: false,
  },
  mr: {
    label: 'Marathi',
    native: 'मराठी',
    sttModel: 'nova-3',
    sttLang: 'mr',
    ttsLang: 'mr',
    // Only two Marathi voices exist; this is the better fit of the pair.
    voiceId: '5c32dce6-936a-4892-b131-bafe474afe5f',
    rtl: false,
  },
  bn: {
    label: 'Bengali',
    native: 'বাংলা',
    sttModel: 'nova-3',
    sttLang: 'bn',
    ttsLang: 'bn',
    // "Ananya - Paced Helper".
    voiceId: '48b9e1de-e2fa-4914-8b32-31c437813548',
    rtl: false,
  },
};

export const DEFAULT_LANGUAGE = 'hi';

/**
 * Resolve a language code to its spec, falling back rather than throwing.
 *
 * Accepts a bare code or a regional variant, so a stored 'hi-IN' or 'en-GB'
 * resolves instead of silently running the session in the wrong language.
 */
export function resolveLanguage(code) {
  if (!code) return LANGUAGES[DEFAULT_LANGUAGE];
  if (LANGUAGES[code]) return LANGUAGES[code];

  const base = String(code).split('-')[0].toLowerCase();
  if (LANGUAGES[base]) return LANGUAGES[base];
  // 'en-GB', 'en-IN' and friends all mean English here.
  if (base === 'en') return LANGUAGES['en-US'];

  return LANGUAGES[DEFAULT_LANGUAGE];
}

/** Canonical key for a language code, for cache keys and comparisons. */
export function languageKey(code) {
  const spec = resolveLanguage(code);
  return Object.keys(LANGUAGES).find(k => LANGUAGES[k] === spec) ?? DEFAULT_LANGUAGE;
}

/** Every supported language, for the UI picker. */
export const languageOptions = () =>
  Object.entries(LANGUAGES).map(([code, spec]) => ({
    code,
    label: spec.label,
    native: spec.native,
  }));

export default { LANGUAGES, DEFAULT_LANGUAGE, resolveLanguage, languageKey, languageOptions };
