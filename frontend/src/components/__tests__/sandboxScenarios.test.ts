import { describe, it, expect } from 'vitest';
import { matchedScenarios, SCENARIOS } from '../VoiceSandbox';

describe('SCENARIOS', () => {
  it('each one names what it proves', () => {
    for (const s of SCENARIOS) {
      expect(s.proves.length).toBeGreaterThan(0);
      expect(s.say.length).toBeGreaterThan(10);
      expect(s.hint.length).toBeGreaterThan(10);
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(SCENARIOS.map(s => s.id)).size).toBe(SCENARIOS.length);
  });
});

describe('matchedScenarios', () => {
  it('matches a card read out verbatim', () => {
    for (const scenario of SCENARIOS) {
      expect(matchedScenarios(scenario.say)).toContain(scenario.id);
    }
  });

  it('matches a paraphrase, which is how people actually speak', () => {
    // Nobody reads the card word for word; requiring that would mean the
    // checklist never ticks.
    expect(matchedScenarios('my salary comes on the 18th so I will pay then'))
      .toContain('promise');
    expect(matchedScenarios('look I lost my job, cannot manage right now'))
      .toContain('hardship');
  });

  it('survives the casing and punctuation a transcript brings', () => {
    expect(matchedScenarios("I ALREADY paid this, on the 2nd — check again!"))
      .toContain('dispute');
  });

  it('matches a transcript that came back in Hindi', () => {
    // Deepgram returns Devanagari for a Hindi call, so the English keywords in
    // the card never appear. The checklist simply does not tick, which is honest
    // -- what must not happen is a crash or a false match.
    expect(() => matchedScenarios('अठारह तारीख को सैलरी आएगी, तब कर दूंगा')).not.toThrow();
    expect(matchedScenarios('अठारह तारीख को सैलरी आएगी')).toEqual([]);
  });

  it('ignores an unrelated utterance', () => {
    expect(matchedScenarios('hello how are you doing today')).toEqual([]);
  });

  it('ignores an utterance carrying only filler words', () => {
    // Short words match everything and distinguish nothing, so they are dropped.
    expect(matchedScenarios('the and you a about')).toEqual([]);
  });

  it('ignores empty and whitespace input', () => {
    expect(matchedScenarios('')).toEqual([]);
    expect(matchedScenarios('   ')).toEqual([]);
    expect(matchedScenarios(undefined as any)).toEqual([]);
  });

  it('needs two content words, not one', () => {
    // "salary" alone comes up constantly in a collections call.
    expect(matchedScenarios('my salary')).toEqual([]);
  });

  it('can match more than one scenario from a single utterance', () => {
    const said = `${SCENARIOS[1].say} ${SCENARIOS[2].say}`;
    const matched = matchedScenarios(said);
    expect(matched).toContain(SCENARIOS[1].id);
    expect(matched).toContain(SCENARIOS[2].id);
  });
});
