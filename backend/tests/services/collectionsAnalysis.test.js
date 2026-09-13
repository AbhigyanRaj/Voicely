import { jest } from '@jest/globals';

const callGroqChatCompletion = jest.fn();

// gemini.js warms the Groq socket at import time, so the mock has to return a
// promise rather than undefined or the module fails to load at all.
const mockFetch = jest.fn(async () => ({
  ok: false,
  status: 503,
  text: async () => 'stubbed: no provider in tests',
}));
jest.unstable_mockModule('node-fetch', () => ({ default: mockFetch }));

// Without a key the provider call throws before fetch is reached, every test
// silently falls through to the failure path, and assertions that happen to
// match the fallback pass for the wrong reason. Set one so the stub is actually
// exercised.
process.env.GROQ_API_KEY = 'test-key-not-used';

const { performDeepAnalysis, COLLECTION_OUTCOMES, NON_PAYMENT_REASONS } =
  await import('../../src/config/gemini.js');

/**
 * The provider is stubbed at the HTTP boundary so these run offline and for
 * free. What is under test is our handling of the result -- the closed-set
 * clamping and the escalation rules, which must hold whatever comes back.
 */
const stubReply = (obj) => mockFetch.mockResolvedValueOnce({
  ok: true,
  json: async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] }),
});

beforeEach(() => mockFetch.mockClear());

describe('the outcome vocabulary', () => {
  it('matches the union the frontend renders', () => {
    // frontend/src/lib/collections.ts declares the same eight. A mismatch means
    // an outcome arrives that the UI has no label or colour for.
    expect(COLLECTION_OUTCOMES).toEqual([
      'promise_to_pay', 'partial_promise', 'dispute', 'hardship',
      'callback', 'refused', 'wrong_number', 'no_answer',
    ]);
  });

  it('offers a reason for every common way a payment is missed', () => {
    expect(NON_PAYMENT_REASONS).toContain('job_loss');
    expect(NON_PAYMENT_REASONS).toContain('medical');
    expect(NON_PAYMENT_REASONS).toContain('salary_delayed');
    expect(NON_PAYMENT_REASONS).toContain('other');
  });
});

describe('holding the model to a closed set', () => {
  it('replaces an invented outcome rather than storing it', async () => {
    // The UI maps outcome to a label and a colour; an outcome it has never heard
    // of renders as a blank row.
    stubReply({ outcome: 'customer_was_lovely', summary: 'x' });
    const r = await performDeepAnalysis('t', 'collections', 'R', 'EMI', []);
    expect(COLLECTION_OUTCOMES).toContain(r.outcome);
    expect(r.outcome).toBe('no_answer');
  });

  it('normalises an unrecognised reason to other', async () => {
    stubReply({ outcome: 'callback', reason: 'mercury_retrograde' });
    const r = await performDeepAnalysis('t', 'collections', 'R', 'EMI', []);
    expect(r.reason).toBe('other');
  });

  it('drops a promise date that is not a real date', async () => {
    // "next Tuesday" is useless three days later, which is exactly when it is read.
    stubReply({ outcome: 'promise_to_pay', promisedOn: 'next Tuesday' });
    const r = await performDeepAnalysis('t', 'collections', 'R', 'EMI', []);
    expect(r.promisedOn).toBeNull();
  });

  it('keeps a well-formed promise date', async () => {
    stubReply({ outcome: 'promise_to_pay', promisedOn: '2026-09-18', promisedAmount: 4820 });
    const r = await performDeepAnalysis('t', 'collections', 'R', 'EMI', []);
    expect(r.promisedOn).toBe('2026-09-18');
    expect(r.promisedAmount).toBe(4820);
  });

  it('escalates hardship even when the model said not to', async () => {
    // Someone who has lost their job must reach a person. This is not a judgement
    // call we delegate to the model.
    stubReply({ outcome: 'hardship', escalate: false, reason: 'job_loss' });
    const r = await performDeepAnalysis('t', 'collections', 'R', 'EMI', []);
    expect(r.escalate).toBe(true);
  });

  it('escalates a disputed amount even when the model said not to', async () => {
    stubReply({ outcome: 'dispute', escalate: false });
    const r = await performDeepAnalysis('t', 'collections', 'R', 'EMI', []);
    expect(r.escalate).toBe(true);
  });

  it('leaves a routine promise unescalated', async () => {
    stubReply({ outcome: 'promise_to_pay', escalate: false, promisedOn: '2026-09-18' });
    const r = await performDeepAnalysis('t', 'collections', 'R', 'EMI', []);
    expect(r.escalate).toBe(false);
  });
});

describe('failure behaviour', () => {
  it('escalates rather than silently recording nothing', async () => {
    // A call nobody can read must reach a person, not sit in the database
    // looking like an unremarkable no-answer.
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'provider down' });
    const result = await performDeepAnalysis('AI: hello\nUser: hi', 'collections', 'Ramesh', 'EMI', []);

    expect(result.escalate).toBe(true);
    expect(result.escalateReason).toMatch(/person should read/i);
    expect(result.rightPartyContact).toBe(false);
    expect(COLLECTION_OUTCOMES).toContain(result.outcome);
  });

  it('never leaves a promise date behind on failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'provider down' });
    const result = await performDeepAnalysis('AI: hello', 'collections', 'Ramesh', 'EMI', []);
    expect(result.promisedOn).toBeNull();
    expect(result.promisedAmount).toBeNull();
  });

  it('returns every field the Call model writes', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'provider down' });
    const result = await performDeepAnalysis('AI: hello', 'collections', 'Ramesh', 'EMI', []);
    for (const key of [
      'outcome', 'promisedOn', 'promisedAmount', 'reason', 'rightPartyContact',
      'escalate', 'escalateReason', 'borrowerQuote', 'sentiment', 'summary',
    ]) {
      expect(result).toHaveProperty(key);
    }
  });
});

describe('patience under a rate limit', () => {
  it('retries a rate-limited analysis instead of giving up', async () => {
    jest.useFakeTimers();
    try {
      // The analysis runs at the end of a call, when the conversation has
      // already spent the minute's budget -- so a single 429 must not be the end
      // of it. Nobody is waiting on this call, unlike a live turn.
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate_limit_exceeded' })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [{ message: { content: JSON.stringify({ outcome: 'promise_to_pay', promisedOn: '2026-09-18' }) } }],
          }),
        });

      const pending = performDeepAnalysis('t', 'collections', 'R', 'EMI', []);
      await jest.advanceTimersByTimeAsync(5000);
      const result = await pending;

      expect(result.outcome).toBe('promise_to_pay');
      expect(result.promisedOn).toBe('2026-09-18');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('gives up eventually rather than retrying forever', async () => {
    jest.useFakeTimers();
    try {
      mockFetch.mockResolvedValue({ ok: false, status: 429, text: async () => 'rate_limit_exceeded' });

      const pending = performDeepAnalysis('t', 'collections', 'R', 'EMI', []);
      await jest.advanceTimersByTimeAsync(60000);
      const result = await pending;

      // And when it does give up, the call still reaches a person.
      expect(result.escalate).toBe(true);
      expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(4);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not retry a failure that is not a rate limit', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'bad request' });
    const result = await performDeepAnalysis('t', 'collections', 'R', 'EMI', []);
    expect(result.escalate).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('telling a daily cap from a per-minute one', () => {
  it('does not wait out a daily quota', async () => {
    // A per-day limit resets at midnight, not in twenty-five seconds. Retrying
    // holds the session open and then fails identically.
    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({
        error: { message: 'Rate limit reached ... on tokens per day (TPD): Limit 200000' },
      }),
    });

    const result = await performDeepAnalysis('t', 'collections', 'R', 'EMI', []);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.escalate).toBe(true);
  });
});
