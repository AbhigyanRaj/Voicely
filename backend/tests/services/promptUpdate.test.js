import { jest } from '@jest/globals';

const generateConversationalResponseStream = jest.fn();

jest.unstable_mockModule('../../src/config/gemini.js', () => ({
  generateConversationalResponseStream,
  evaluateApplication: jest.fn(),
  performDeepAnalysis: jest.fn(),
}));

const { default: StreamingCallHandler, buildSystemPrompt } =
  await import('../../src/services/streamingCallHandler.js');

const MODULE = {
  name: 'Acme',
  systemPrompt: 'You are Sarah, a calm advisor.',
  questions: [{ order: 1, question: 'What do you do?' }],
};

/** A handler with initialize()'s database work already done. */
const makeHandler = () => {
  const h = new StreamingCallHandler('browser_sandbox_1', 'mod1', '+1', 'Steve');
  h.module = MODULE;
  h.systemPrompt = buildSystemPrompt(MODULE, 'Steve');
  return h;
};

beforeEach(() => generateConversationalResponseStream.mockReset());

describe('buildSystemPrompt', () => {
  it('is pure, so a swap needs no database round trip', () => {
    const a = buildSystemPrompt(MODULE, 'Steve');
    const b = buildSystemPrompt(MODULE, 'Steve');
    expect(a).toBe(b);
  });

  it('carries the persona and the caller name', () => {
    const prompt = buildSystemPrompt(MODULE, 'Steve');
    expect(prompt).toContain('You are Sarah, a calm advisor.');
    expect(prompt).toContain('Steve');
    expect(prompt).toContain('What do you do?');
  });

  it('numbers the questions in their given order', () => {
    const prompt = buildSystemPrompt({
      ...MODULE,
      questions: [{ order: 2, question: 'Second?' }, { order: 1, question: 'First?' }],
    }, 'Steve');
    expect(prompt.indexOf('1. First?')).toBeLessThan(prompt.indexOf('2. Second?'));
  });

  it('does not mutate the caller’s question array', () => {
    const questions = [{ order: 2, question: 'B' }, { order: 1, question: 'A' }];
    buildSystemPrompt({ ...MODULE, questions }, 'Steve');
    expect(questions[0].question).toBe('B');
  });

  it('falls back to a generic persona when none is set', () => {
    expect(buildSystemPrompt({ ...MODULE, systemPrompt: '  ' }, 'Steve')).toContain('representing Acme');
  });
});

describe('updateInstruction while idle', () => {
  it('takes effect immediately', () => {
    const h = makeHandler();
    expect(h.updateInstruction('You are a terse pirate.')).toEqual({ applied: true, queued: false });
    expect(h.systemPrompt).toContain('You are a terse pirate.');
    expect(h.systemPrompt).not.toContain('a calm advisor');
  });

  it('keeps the caller name and the questions', () => {
    const h = makeHandler();
    h.updateInstruction('You are a terse pirate.');
    expect(h.systemPrompt).toContain('Steve');
    expect(h.systemPrompt).toContain('What do you do?');
  });

  it('ignores an empty instruction', () => {
    const h = makeHandler();
    const before = h.systemPrompt;
    expect(h.updateInstruction('   ')).toEqual({ applied: false, queued: false });
    expect(h.systemPrompt).toBe(before);
  });

  it('refuses once the session has ended', () => {
    const h = makeHandler();
    h.state = 'ENDED';
    expect(h.updateInstruction('Anything.')).toEqual({ applied: false, queued: false });
  });

  it('aborts a speculation generated under the old persona', () => {
    const h = makeHandler();
    const abort = jest.fn();
    // Adoption compares transcript text only -- it cannot tell which prompt
    // produced the reply -- so a surviving speculation would be spoken in a
    // voice the user has already replaced.
    h.speculation = { controller: { abort }, normalized: 'hello there', adopted: false };

    h.updateInstruction('You are a terse pirate.');

    expect(abort).toHaveBeenCalledTimes(1);
    expect(h.speculation).toBeNull();
  });
});

describe('updateInstruction mid-turn', () => {
  it('queues rather than rewriting the rules under a reply in flight', () => {
    const h = makeHandler();
    h.state = 'THINKING';
    const before = h.systemPrompt;

    expect(h.updateInstruction('You are a terse pirate.')).toEqual({ applied: false, queued: true });
    expect(h.systemPrompt).toBe(before);
    expect(h.pendingInstruction).toBe('You are a terse pirate.');
  });

  it('applies the queued change at the turn boundary', async () => {
    const h = makeHandler();
    generateConversationalResponseStream.mockImplementation(async (_prompt, _history, onChunk) => {
      // The swap lands while the reply is streaming.
      h.updateInstruction('You are a terse pirate.');
      onChunk('Certainly.');
      return 'Certainly.';
    });

    await h.processFinalTranscript('Hello there.', 0.9);

    expect(h.state).toBe('IDLE');
    expect(h.systemPrompt).toContain('You are a terse pirate.');
    expect(h.pendingInstruction).toBeNull();
  });

  it('generates the in-flight reply with the old prompt, not the new one', async () => {
    const h = makeHandler();
    let promptSeenByLLM = null;
    generateConversationalResponseStream.mockImplementation(async (prompt, _history, onChunk) => {
      promptSeenByLLM = prompt;
      h.updateInstruction('You are a terse pirate.');
      onChunk('Certainly.');
      return 'Certainly.';
    });

    await h.processFinalTranscript('Hello there.', 0.9);

    expect(promptSeenByLLM).toContain('a calm advisor');
    expect(promptSeenByLLM).not.toContain('pirate');
  });

  it('uses the new prompt on the following turn', async () => {
    const h = makeHandler();
    const prompts = [];
    generateConversationalResponseStream.mockImplementation(async (prompt, _h, onChunk) => {
      prompts.push(prompt);
      onChunk('Ok.');
      return 'Ok.';
    });

    h.state = 'THINKING';
    h.updateInstruction('You are a terse pirate.');
    h.state = 'IDLE';
    h._flushPendingInstruction();

    await h.processFinalTranscript('Second question.', 0.9);

    expect(prompts[0]).toContain('pirate');
  });

  it('does not resurrect a session that ended mid-turn', async () => {
    const h = makeHandler();
    h.state = 'THINKING';
    h.updateInstruction('You are a terse pirate.');
    h.state = 'ENDED';
    h._flushPendingInstruction();

    // The swap still writes the prompt, but nothing moves the state back to
    // IDLE -- an ended session stays ended.
    expect(h.state).toBe('ENDED');
  });
});
