import { jest } from '@jest/globals';
import { parseRetryAfterMs } from '../../src/config/gemini.js';

describe('parseRetryAfterMs', () => {
  it('reads the millisecond figure Groq names in a 429', () => {
    expect(parseRetryAfterMs(
      'Rate limit reached for model `qwen/qwen3.6-27b` ... Please try again in 840ms. Need more tokens?'
    )).toBe(840);
  });

  it('rounds a fractional millisecond figure up', () => {
    expect(parseRetryAfterMs('Please try again in 123.4ms.')).toBe(124);
  });

  it('reads a seconds figure within the cap', () => {
    expect(parseRetryAfterMs('Please try again in 1.5s.')).toBe(1500);
  });

  it('declines a wait too long to hold a live turn open', () => {
    // Nobody sits through thirty seconds of silence waiting for a reply; an
    // apology now beats an answer then.
    expect(parseRetryAfterMs('Please try again in 30s.')).toBeNull();
    expect(parseRetryAfterMs('Please try again in 60s.')).toBeNull();
  });

  it('caps an over-long millisecond figure rather than honouring it', () => {
    expect(parseRetryAfterMs('Please try again in 9000ms.')).toBe(2000);
  });

  it('returns nothing when the provider gave no hint', () => {
    expect(parseRetryAfterMs('Internal server error')).toBeNull();
    expect(parseRetryAfterMs('')).toBeNull();
    expect(parseRetryAfterMs()).toBeNull();
  });

  it('is case insensitive, since the wording is not a contract', () => {
    expect(parseRetryAfterMs('PLEASE TRY AGAIN IN 500MS.')).toBe(500);
  });
});

describe('a turn the provider refused', () => {
  const MODULE = { name: 'Acme', systemPrompt: 'Be brief.', questions: [{ order: 1, question: 'Q?' }] };

  it('reports the failure instead of resolving quietly', async () => {
    jest.resetModules();
    const generateConversationalResponseStream = jest.fn()
      .mockRejectedValue(new Error('Groq API Error: 429 - rate limited'));
    jest.unstable_mockModule('../../src/config/gemini.js', () => ({
      generateConversationalResponseStream,
      evaluateApplication: jest.fn(),
      performDeepAnalysis: jest.fn(),
      parseRetryAfterMs: jest.fn(),
    }));
    const { default: StreamingCallHandler, buildSystemPrompt } =
      await import('../../src/services/streamingCallHandler.js');

    const h = new StreamingCallHandler('browser_sandbox_x', 'm', '+1', 'Steve');
    h.module = MODULE;
    h.systemPrompt = buildSystemPrompt(MODULE, 'Steve');

    // Swallowing this made the promise resolve normally, so the caller's spoken
    // fallback never ran and the user heard nothing whatsoever.
    await expect(h.processFinalTranscript('Hello there.', 0.9)).rejects.toThrow(/429/);
    // And the session is still usable for the next turn.
    expect(h.state).toBe('IDLE');
  });

  it('leaves an ended session ended rather than reopening it', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../../src/config/gemini.js', () => ({
      generateConversationalResponseStream: jest.fn().mockRejectedValue(new Error('boom')),
      evaluateApplication: jest.fn(),
      performDeepAnalysis: jest.fn(),
      parseRetryAfterMs: jest.fn(),
    }));
    const { default: StreamingCallHandler, buildSystemPrompt } =
      await import('../../src/services/streamingCallHandler.js');

    const h = new StreamingCallHandler('browser_sandbox_y', 'm', '+1', 'Steve');
    h.module = MODULE;
    h.systemPrompt = buildSystemPrompt(MODULE, 'Steve');

    const turn = h.processFinalTranscript('Hello there.', 0.9).catch(() => 'threw');
    h.state = 'ENDED';
    expect(await turn).toBe('threw');
    expect(h.state).toBe('ENDED');
  });
});

describe('speculation backoff under rate limiting', () => {
  it('pauses, then resumes once the cooldown passes', async () => {
    jest.resetModules();
    jest.unstable_mockModule('../../src/config/gemini.js', () => ({
      generateConversationalResponseStream: jest.fn(),
      evaluateApplication: jest.fn(), performDeepAnalysis: jest.fn(), parseRetryAfterMs: jest.fn(),
    }));
    const m = await import('../../src/services/streamingCallHandler.js');
    m._resumeSpeculation();

    expect(m.isSpeculationPaused()).toBe(false);
    m.pauseSpeculation(1_000_000);
    // Speculation spends roughly three full-context requests per turn, which is
    // what pushed the organization over its tokens-per-minute ceiling.
    expect(m.isSpeculationPaused(1_000_000)).toBe(true);
    expect(m.isSpeculationPaused(1_010_000)).toBe(true);
    expect(m.isSpeculationPaused(1_030_000)).toBe(false);
    m._resumeSpeculation();
  });

  it('stops issuing speculative requests while paused', async () => {
    jest.resetModules();
    const generateConversationalResponseStream = jest.fn().mockResolvedValue('ok');
    jest.unstable_mockModule('../../src/config/gemini.js', () => ({
      generateConversationalResponseStream,
      evaluateApplication: jest.fn(), performDeepAnalysis: jest.fn(), parseRetryAfterMs: jest.fn(),
    }));
    const m = await import('../../src/services/streamingCallHandler.js');
    const MOD = { name: 'A', systemPrompt: 'Be brief.', questions: [{ order: 1, question: 'Q?' }] };

    const h = new m.default('browser_sandbox_z', 'm', '+1', 'Steve');
    h.module = MOD;
    h.systemPrompt = m.buildSystemPrompt(MOD, 'Steve');

    m._resumeSpeculation();
    h.speculate('I run a logistics business', 0.9);
    expect(generateConversationalResponseStream).toHaveBeenCalledTimes(1);

    h._abortSpeculation();
    m.pauseSpeculation();
    h.speculate('and we handle many calls daily', 0.9);
    expect(generateConversationalResponseStream).toHaveBeenCalledTimes(1); // no new request

    m._resumeSpeculation();
  });
});
