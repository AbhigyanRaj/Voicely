import { t, STRINGS } from '../../src/config/callStrings.js';
import { LANGUAGES } from '../../src/config/languages.js';

/**
 * These are the strings the SYSTEM says, as opposed to the agent. Two of them
 * are spoken aloud to a borrower; the rest appear on screen mid-call. All of
 * them used to be English regardless of the language the call was held in.
 */

const SCRIPT = {
  hi: /[ऀ-ॿ]/, mr: /[ऀ-ॿ]/, ta: /[஀-௿]/, te: /[ఀ-౿]/, bn: /[ঀ-৿]/,
};

const KEYS = Object.keys(STRINGS);
const LANGUAGE_CODES = Object.keys(LANGUAGES);

describe('coverage', () => {
  const matrix = KEYS.flatMap(key => LANGUAGE_CODES.map(lang => [key, lang]));

  it.each(matrix)('%s exists in %s', (key, lang) => {
    const value = t(key, lang);
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(5);
  });

  it.each(matrix)('%s is written in the script of %s', (key, lang) => {
    if (lang === 'en-US') return;
    expect(t(key, lang)).toMatch(SCRIPT[lang]);
  });

  it('has the two lines that are spoken to a borrower', () => {
    expect(KEYS).toContain('didNotCatch');
    expect(KEYS).toContain('timeLimit');
  });
});

describe('the goodbye', () => {
  it('no longer tells the borrower to log in', () => {
    // The old English line was "Kindly log in to use further" -- a product
    // instruction delivered to someone who believes they are speaking to their
    // lender.
    for (const lang of LANGUAGE_CODES) {
      expect(t('timeLimit', lang)).not.toMatch(/log ?in|sign ?up|sandbox|timer/i);
    }
  });

  it('closes the way a person would', () => {
    expect(t('timeLimit', 'en-US')).toMatch(/thank you/i);
  });
});

describe('resolution', () => {
  it('accepts regional variants', () => {
    expect(t('didNotCatch', 'hi-IN')).toBe(t('didNotCatch', 'hi'));
    expect(t('didNotCatch', 'ta-IN')).toBe(t('didNotCatch', 'ta'));
    expect(t('didNotCatch', 'en-GB')).toBe(t('didNotCatch', 'en-US'));
  });

  it('falls back to English rather than breaking the call', () => {
    // A missing translation should make a call sound odd, not fail.
    for (const code of ['zz', '', null, undefined]) {
      expect(t('didNotCatch', code)).toBeTruthy();
    }
  });

  it('throws on an unknown key instead of speaking it aloud', () => {
    // Returning the key would have the agent say "didNotCatchh" to a borrower.
    expect(() => t('notAKey', 'hi')).toThrow(/Unknown call string/);
  });
});

describe('no leftover English in a non-English call', () => {
  it.each(['hi', 'mr', 'ta', 'te', 'bn'])('every %s string is free of English sentences', (lang) => {
    for (const key of KEYS) {
      const value = t(key, lang);
      // Loan vocabulary in Latin script is normal and expected; whole English
      // sentences are not.
      expect(value).not.toMatch(/\b(Sorry|Please try again|Hello|Could you|thank you for your time)\b/);
    }
  });
});
