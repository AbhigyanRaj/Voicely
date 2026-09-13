import { Backchannel, TOKENS, STABLE_FOR_MS } from '../../src/services/backchannel.js';
import { LANGUAGES, DEFAULT_LANGUAGE } from '../../src/config/languages.js';

const SCRIPT = {
  hi: /[ऀ-ॿ]/, mr: /[ऀ-ॿ]/, ta: /[஀-௿]/, te: /[ఀ-౿]/, bn: /[ঀ-৿]/,
};

describe('tokens', () => {
  it('covers every language the product offers', () => {
    for (const code of Object.keys(LANGUAGES)) {
      expect(TOKENS[code]).toBeDefined();
      expect(TOKENS[code].length).toBeGreaterThan(0);
    }
  });

  it.each(Object.keys(SCRIPT))('%s tokens are in the right script', (lang) => {
    for (const token of TOKENS[lang]) expect(token).toMatch(SCRIPT[lang]);
  });

  it('keeps them short enough to be an interjection', () => {
    for (const list of Object.values(TOKENS)) {
      for (const token of list) expect(token.length).toBeLessThanOrEqual(8);
    }
  });

  it('never says something that sounds like agreement', () => {
    // The agent has not heard the whole sentence yet. Appearing to accept
    // something it was not told is a compliance problem, not a style one.
    for (const list of Object.values(TOKENS)) {
      for (const token of list) {
        expect(token).not.toMatch(/agree|promise|confirm|yes,? I will|ठीक है जी|done/i);
      }
    }
  });

  it('falls back the same way the rest of the pipeline does', () => {
    // An unknown code resolves to the product default everywhere -- speech
    // recognition, the voice, the persona. The backchannel has to agree, or the
    // one word spoken during the gap is in a different language from the reply
    // that follows it.
    expect(new Backchannel({ language: 'zz' }).tokens).toEqual(TOKENS[DEFAULT_LANGUAGE]);
  });

  it('resolves regional variants', () => {
    expect(new Backchannel({ language: 'hi-IN' }).tokens).toEqual(TOKENS.hi);
  });
});

describe('arming the silence clock', () => {
  it('re-arms while new words keep arriving', () => {
    // Someone mid-sentence keeps producing text, so the clock keeps restarting
    // and never expires.
    const bc = new Backchannel({ language: 'hi' });
    expect(bc.noteInterim('kab')).toBe(true);
    expect(bc.noteInterim('kab tak')).toBe(true);
    expect(bc.noteInterim('kab tak kar')).toBe(true);
  });

  it('does not re-arm when the text stands still', () => {
    // This is the whole signal: the words stopped changing.
    const bc = new Backchannel({ language: 'hi' });
    bc.noteInterim('kab tak kar');
    expect(bc.noteInterim('kab tak kar')).toBe(false);
  });

  it('ignores an empty transcript', () => {
    const bc = new Backchannel({ language: 'hi' });
    expect(bc.noteInterim('')).toBe(false);
    expect(bc.noteInterim(null)).toBe(false);
  });

  it('stops arming once it has fired this turn', () => {
    const bc = new Backchannel({ language: 'hi' });
    bc.noteInterim('something');
    bc.take();
    expect(bc.noteInterim('something else')).toBe(false);
  });
});

describe('the gates, checked when the clock expires', () => {
  const armed = () => {
    const bc = new Backchannel({ language: 'hi' });
    bc.noteInterim('kab tak kar');
    return bc;
  };

  it('fires when a reply is being generated and the agent is quiet', () => {
    expect(armed().canFire({ speculationInFlight: true, agentSpeaking: false })).toBe(true);
  });

  it('does not fire while the agent is already speaking', () => {
    // Checked at expiry rather than when armed, because the agent may have
    // started in between. That would be a collision, not a backchannel.
    expect(armed().canFire({ speculationInFlight: true, agentSpeaking: true })).toBe(false);
  });

  it('does not fire before a reply is being generated', () => {
    // Nothing to cover for, and acknowledging half a sentence is worse than
    // staying quiet.
    expect(armed().canFire({ speculationInFlight: false, agentSpeaking: false })).toBe(false);
  });

  it('does not fire without having heard anything', () => {
    const bc = new Backchannel({ language: 'hi' });
    expect(bc.canFire({ speculationInFlight: true, agentSpeaking: false })).toBe(false);
  });

  it('fires at most once per turn', () => {
    const bc = armed();
    expect(bc.canFire({ speculationInFlight: true, agentSpeaking: false })).toBe(true);
    bc.take();
    expect(bc.canFire({ speculationInFlight: true, agentSpeaking: false })).toBe(false);
  });

  it('arms again on the next turn', () => {
    const bc = armed();
    bc.take();
    bc.reset();
    expect(bc.noteInterim('new sentence')).toBe(true);
    expect(bc.canFire({ speculationInFlight: true, agentSpeaking: false })).toBe(true);
  });
});

describe('what it says', () => {
  it('never repeats the previous token', () => {
    const bc = new Backchannel({ language: 'hi' });
    let previous = null;
    for (let i = 0; i < 40; i++) {
      bc.firedThisTurn = false;
      const token = bc.take();
      expect(token).not.toBe(previous);
      expect(TOKENS.hi).toContain(token);
      previous = token;
    }
  });

  it('copes with a single-token language without looping forever', () => {
    const bc = new Backchannel({ language: 'en-US' });
    bc.tokens = ['Mm-hmm'];
    expect(bc.take()).toBe('Mm-hmm');
  });

  it('marks the turn as spent', () => {
    const bc = new Backchannel({ language: 'hi' });
    expect(bc.firedThisTurn).toBe(false);
    bc.take();
    expect(bc.firedThisTurn).toBe(true);
  });
});
