import { SCENARIOS, getDemoAgentModule, resolveScenarioId } from '../../src/config/demoAgents.js';
import { LANGUAGES } from '../../src/config/languages.js';

/**
 * The bug this file exists to prevent: a user picks Marathi, and gets Hindi.
 *
 * Scenario and language are separate axes. Every combination must produce a
 * coherent agent -- greeting, persona and questions all in the chosen language,
 * with a voice that belongs to it.
 */

/** Which Unicode block a language's text must fall in. */
const SCRIPT = {
  hi: /[ऀ-ॿ]/,
  mr: /[ऀ-ॿ]/,
  ta: /[஀-௿]/,
  te: /[ఀ-౿]/,
  bn: /[ঀ-৿]/,
  'en-US': /^[\x00-\x7F\s]+$/,
};

const SCENARIO_IDS = Object.keys(SCENARIOS);
const LANGUAGE_CODES = Object.keys(LANGUAGES);

describe('every scenario in every language', () => {
  const matrix = SCENARIO_IDS.flatMap(id => LANGUAGE_CODES.map(lang => [id, lang]));

  it.each(matrix)('%s in %s produces a coherent agent', (id, lang) => {
    const agent = getDemoAgentModule(id, 'Female', lang);

    expect(agent.language).toBe(lang === 'en-US' ? 'en-US' : lang);
    expect(agent.greeting.length).toBeGreaterThan(10);
    expect(agent.systemPrompt.length).toBeGreaterThan(50);
    expect(agent.questions.length).toBeGreaterThan(0);
    expect(agent.voiceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each(matrix)('%s greets in the script of %s', (id, lang) => {
    // The reported symptom was a Marathi voice reading Hindi words. The greeting
    // is pre-synthesized, so getting this wrong is audible on the first syllable.
    const { greeting } = getDemoAgentModule(id, 'Female', lang);
    expect(greeting).toMatch(SCRIPT[lang]);
  });

  it.each(matrix)('%s uses the %s voice, not another language\'s', (id, lang) => {
    const agent = getDemoAgentModule(id, 'Female', lang);
    expect(agent.voiceId).toBe(LANGUAGES[lang].voiceId);
  });

  it.each(matrix)('%s introduces itself by the name it is given in %s', (id, lang) => {
    // A greeting naming someone the persona never mentions is worse than none.
    const agent = getDemoAgentModule(id, 'Female', lang);
    expect(agent.greeting).toContain(agent.personaName);
    expect(agent.systemPrompt).toContain(agent.personaName);
  });
});

describe('language decides the persona, not the scenario', () => {
  it('gives the same scenario a different greeting per language', () => {
    const greetings = LANGUAGE_CODES.map(
      lang => getDemoAgentModule('demo-agent-emi-reminder', 'Female', lang).greeting
    );
    expect(new Set(greetings).size).toBe(LANGUAGE_CODES.length);
  });

  it('prefers a hand-written native persona where one exists', () => {
    // Hindi has one. A reviewed persona beats an on-the-fly translation.
    const hi = getDemoAgentModule('demo-agent-emi-reminder', 'Female', 'hi');
    expect(hi.systemPrompt).toMatch(SCRIPT.hi);
    expect(hi.questions[0].question).toMatch(SCRIPT.hi);
  });

  it('falls back to the English source where no native persona exists', () => {
    // Marathi has no hand-written persona yet, so it gets the English one plus
    // the language rule that buildSystemPrompt adds. The QUESTIONS stay English
    // too -- the model renders them in Marathi as it speaks.
    const mr = getDemoAgentModule('demo-agent-emi-reminder', 'Female', 'mr');
    expect(mr.systemPrompt).toContain('calling on behalf of a lender');
    expect(mr.questions[0].question).toBe('Am I speaking with the right person?');
    // But the greeting, which is pre-synthesized and cannot be translated later,
    // is still Marathi.
    expect(mr.greeting).toMatch(SCRIPT.mr);
  });

  it('changes the persona name with the gender', () => {
    const f = getDemoAgentModule('demo-agent-emi-reminder', 'Female', 'hi');
    const m = getDemoAgentModule('demo-agent-emi-reminder', 'Male', 'hi');
    expect(f.personaName).not.toBe(m.personaName);
    expect(f.greeting).not.toBe(m.greeting);
  });
});

describe('the scenarios themselves', () => {
  it('covers reminder, dispute and hardship', () => {
    expect(SCENARIO_IDS).toContain('demo-agent-emi-reminder');
    expect(SCENARIO_IDS).toContain('demo-agent-dispute');
    expect(SCENARIO_IDS).toContain('demo-agent-hardship');
  });

  it('tells the hardship agent to stop collecting', () => {
    // The whole point of that scenario, and a compliance requirement.
    const { systemPrompt } = getDemoAgentModule('demo-agent-hardship', 'Female', 'en-US');
    expect(systemPrompt).toMatch(/stop collecting/i);
  });

  it('tells the dispute agent not to argue', () => {
    const { systemPrompt } = getDemoAgentModule('demo-agent-dispute', 'Female', 'en-US');
    expect(systemPrompt).toMatch(/do not argue/i);
  });

  it('gives every scenario a greeting in every supported language', () => {
    for (const [id, scenario] of Object.entries(SCENARIOS)) {
      for (const lang of LANGUAGE_CODES) {
        expect(scenario.greetings[lang]).toBeDefined();
      }
      expect(id).toBeTruthy();
    }
  });
});

describe('ids that used to encode a language', () => {
  it.each([
    ['demo-agent-hindi-reminder', 'demo-agent-emi-reminder'],
    ['demo-agent-tamil-reminder', 'demo-agent-emi-reminder'],
    ['demo-agent-english-reminder', 'demo-agent-emi-reminder'],
    ['demo-agent-hindi-dispute', 'demo-agent-dispute'],
    // Sales-era ids, so an old saved Call row still renders.
    ['demo-agent-calm', 'demo-agent-emi-reminder'],
    ['demo-agent-support', 'demo-agent-emi-reminder'],
  ])('%s resolves to %s', (legacy, expected) => {
    expect(resolveScenarioId(legacy)).toBe(expected);
  });

  it('resolves an unknown id rather than throwing', () => {
    expect(resolveScenarioId('nonsense')).toBe('demo-agent-emi-reminder');
    expect(resolveScenarioId(undefined)).toBe('demo-agent-emi-reminder');
  });

  it('honours the requested language even for a legacy id', () => {
    // The id says "hindi"; the caller says Tamil. The caller wins -- that is the
    // entire bug this restructure fixes.
    const agent = getDemoAgentModule('demo-agent-hindi-reminder', 'Female', 'ta');
    expect(agent.language).toBe('ta');
    expect(agent.greeting).toMatch(SCRIPT.ta);
  });
});
