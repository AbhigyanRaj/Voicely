import { LANGUAGES, DEFAULT_LANGUAGE, resolveLanguage, languageKey, languageOptions }
  from '../../src/config/languages.js';

describe('resolveLanguage', () => {
  it('resolves every declared language', () => {
    for (const code of Object.keys(LANGUAGES)) {
      expect(resolveLanguage(code)).toBe(LANGUAGES[code]);
    }
  });

  it('accepts regional variants, which is how they arrive from the wild', () => {
    // A stored 'hi-IN' or 'ta-IN' must not silently run the session in the
    // default language -- the borrower would be spoken to in the wrong tongue.
    expect(resolveLanguage('hi-IN').label).toBe('Hindi');
    expect(resolveLanguage('ta-IN').label).toBe('Tamil');
    expect(resolveLanguage('te-IN').label).toBe('Telugu');
  });

  it('maps every English variant onto one spec', () => {
    for (const code of ['en', 'en-GB', 'en-IN', 'en-AU']) {
      expect(resolveLanguage(code).label).toBe('English');
    }
  });

  it('falls back rather than throwing on junk', () => {
    for (const code of ['zz', '', null, undefined, 'not-a-language']) {
      expect(resolveLanguage(code)).toBe(LANGUAGES[DEFAULT_LANGUAGE]);
    }
  });
});

describe('provider settings', () => {
  it('puts every Indian language on nova-3', () => {
    // Verified against Deepgram's models API by canonical name. Reading the
    // display name instead suggests these sit on an older generation; they do not.
    for (const code of ['hi', 'ta', 'te', 'mr', 'bn']) {
      expect(LANGUAGES[code].sttModel).toBe('nova-3');
    }
  });

  it('leaves English on the model its latency baseline was measured on', () => {
    expect(LANGUAGES['en-US'].sttModel).toMatch(/nova-2/);
  });

  it('gives every language a Cartesia voice and a TTS language code', () => {
    for (const [code, spec] of Object.entries(LANGUAGES)) {
      expect(spec.voiceId).toMatch(/^[0-9a-f-]{36}$/);
      expect(spec.ttsLang).toBeTruthy();
      // The TTS code is the bare language, never a regional variant.
      expect(spec.ttsLang).not.toContain('-');
      expect(spec.native.length).toBeGreaterThan(0);
      expect(code).toBeTruthy();
    }
  });

  it('gives each language a distinct voice', () => {
    const voices = Object.values(LANGUAGES).map(s => s.voiceId);
    expect(new Set(voices).size).toBe(voices.length);
  });
});

describe('languageKey', () => {
  it('collapses variants to the canonical key', () => {
    expect(languageKey('hi-IN')).toBe('hi');
    expect(languageKey('en-GB')).toBe('en-US');
    expect(languageKey('nonsense')).toBe(DEFAULT_LANGUAGE);
  });
});

describe('languageOptions', () => {
  it('names each language in its own script, for the picker', () => {
    const natives = languageOptions().map(o => o.native);
    expect(natives).toContain('हिन्दी');
    expect(natives).toContain('தமிழ்');
    expect(natives).toContain('తెలుగు');
  });
});
