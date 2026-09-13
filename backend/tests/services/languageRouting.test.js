import { jest } from '@jest/globals';
import { buildSystemPrompt } from '../../src/services/streamingCallHandler.js';
import { getDemoAgentModule } from '../../src/config/demoAgents.js';
import { LANGUAGES, resolveLanguage } from '../../src/config/languages.js';

/**
 * The reported bug, pinned.
 *
 * "other language guy is not actually speaking in that language" -- selecting
 * Marathi produced Hindi. The root cause was that the prompt's language rule
 * said "speak the language the persona above is written in", pointing at the
 * persona instead of at the caller's choice, so the selected language had no
 * path to the model at all.
 */

const LANGUAGE_CODES = Object.keys(LANGUAGES);

describe('the prompt names the selected language', () => {
  it.each(LANGUAGE_CODES.filter(c => c !== 'en-US'))('%s is named explicitly', (code) => {
    const spec = resolveLanguage(code);
    const agent = getDemoAgentModule('demo-agent-emi-reminder', 'Female', code);
    const prompt = buildSystemPrompt(agent, 'रमेश', code);

    expect(prompt).toContain(`speak ONLY in ${spec.label}`);
    expect(prompt).toContain(spec.native);
    // The defective phrasing must never come back.
    expect(prompt).not.toContain('the language the persona above is written in');
  });

  it('gives English its own rule', () => {
    const agent = getDemoAgentModule('demo-agent-emi-reminder', 'Female', 'en-US');
    const prompt = buildSystemPrompt(agent, 'Steve', 'en-US');
    expect(prompt).toMatch(/Speak natural English/);
    expect(prompt).not.toMatch(/speak ONLY in English/);
  });

  it('tells the model not to drift back to English', () => {
    // The failure mode a language directive has to survive: the persona and all
    // the surrounding rules are themselves written in English.
    const prompt = buildSystemPrompt(
      getDemoAgentModule('demo-agent-emi-reminder', 'Female', 'mr'), 'रमेश', 'mr'
    );
    expect(prompt).toMatch(/Do not switch to English/i);
    expect(prompt).toMatch(/instructions above are written in English/i);
  });

  it('resolves a regional variant to the same rule', () => {
    const a = buildSystemPrompt(getDemoAgentModule('demo-agent-emi-reminder', 'Female', 'hi'), 'R', 'hi');
    const b = buildSystemPrompt(getDemoAgentModule('demo-agent-emi-reminder', 'Female', 'hi-IN'), 'R', 'hi-IN');
    expect(a).toBe(b);
  });

  it('falls back to a valid rule for an unknown language', () => {
    const prompt = buildSystemPrompt(
      getDemoAgentModule('demo-agent-emi-reminder', 'Female', 'zz'), 'R', 'zz'
    );
    expect(prompt).toMatch(/LANGUAGE:/);
  });
});

describe('a Marathi session is Marathi all the way down', () => {
  // The acceptance test for the whole fix: one language choice, four consumers.
  const code = 'mr';
  const spec = resolveLanguage(code);
  const agent = getDemoAgentModule('demo-agent-emi-reminder', 'Female', code);

  it('recognises speech as Marathi', () => {
    expect(spec.sttLang).toBe('mr');
    expect(spec.sttModel).toBe('nova-3');
  });

  it('synthesizes as Marathi', () => {
    expect(spec.ttsLang).toBe('mr');
  });

  it('uses a Marathi voice', () => {
    expect(agent.voiceId).toBe(LANGUAGES.mr.voiceId);
  });

  it('greets in Marathi', () => {
    expect(agent.greeting).toMatch(/[ऀ-ॿ]/);
  });

  it('instructs the model to reply in Marathi', () => {
    expect(buildSystemPrompt(agent, 'रमेश', code)).toContain('speak ONLY in Marathi');
  });
});

describe('the conduct rules survive translation', () => {
  it.each(LANGUAGE_CODES)('%s still carries every compliance rule', (code) => {
    // These are regulatory, not stylistic. They must not fall out of a prompt
    // just because the language changed.
    const prompt = buildSystemPrompt(
      getDemoAgentModule('demo-agent-emi-reminder', 'Female', code), 'R', code
    );
    expect(prompt).toMatch(/IDENTITY FIRST/);
    expect(prompt).toMatch(/NEVER threaten/);
    expect(prompt).toMatch(/ACCEPT WHAT THEY OFFER/);
    expect(prompt).toMatch(/genuine hardship/);
    expect(prompt).toMatch(/Never claim to be a person/);
  });
});

describe('the caller\'s name survives the call', () => {
  it.each(['hi', 'mr', 'ta', 'te', 'bn'])('is protected from translation in %s', (lang) => {
    // Observed live: "Abhigyan" came out as "अभियान" -- the ordinary word for
    // "campaign" -- so the agent addressed the borrower as "Campaign". A name
    // dropped into a prompt written in another script gets pulled towards the
    // nearest real word unless the model is told not to.
    const prompt = buildSystemPrompt(
      getDemoAgentModule('demo-agent-emi-reminder', 'Female', lang), 'Abhigyan', lang
    );
    expect(prompt).toContain('Abhigyan');
    expect(prompt).toMatch(/never translate it/i);
    expect(prompt).toMatch(/never substitute a similar-sounding word/i);
  });

  it('keeps a name already written in the local script', () => {
    const prompt = buildSystemPrompt(
      getDemoAgentModule('demo-agent-emi-reminder', 'Female', 'hi'), 'रमेश', 'hi'
    );
    expect(prompt).toContain('रमेश');
  });
});
