import StreamingTTSBase from '../../src/services/streamingTTSBase.js';
import { reset } from '../../src/utils/latencyMetrics.js';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

/** Records call order and lets each clause take a caller-chosen duration. */
class FakeTTS extends StreamingTTSBase {
  constructor(options = {}) {
    super(options);
    this.calls = [];
    this.concurrentPeak = 0;
    this._active = 0;
    this.delays = options.delays || {};
  }

  async _synthesize(text) {
    this.calls.push(text);
    this._active += 1;
    this.concurrentPeak = Math.max(this.concurrentPeak, this._active);
    await tick(this.delays[text] ?? 1);
    this._active -= 1;
    if (this.failOn === text) throw new Error('boom');
    return { payload: text };
  }
}

const collect = (tts) => {
  const seen = [];
  tts.on('audio', (a) => seen.push(a.payload));
  return seen;
};

describe('StreamingTTSBase', () => {
  beforeEach(() => reset());

  it('emits the first clause without waiting for flush', async () => {
    const tts = new FakeTTS();
    const seen = collect(tts);

    // The exact reply shape that used to stall: no punctuation at all.
    tts.processTextChunk('Hi Steve how are you doing today');
    await tick(20);

    expect(seen.length).toBeGreaterThan(0);
  });

  it('emits in sequence order even when later clauses synthesize first', async () => {
    // Clause 1 is slow, clause 2 and 3 are fast. Without ordering they would
    // arrive backwards and the caller would play them out of order.
    const tts = new FakeTTS({ delays: { 'one,': 40, 'two,': 5, 'three.': 5 } });
    const seen = collect(tts);

    tts.processTextChunk('one, two, three. ');
    await tick(120);

    expect(seen).toEqual(['one,', 'two,', 'three.']);
  });

  it('pipelines rather than serializing requests', async () => {
    const tts = new FakeTTS({ delays: { 'one,': 30, 'two,': 30, 'three.': 30 } });
    tts.processTextChunk('one, two, three. ');
    await tick(10); // inside the first request's window

    expect(tts.concurrentPeak).toBeGreaterThan(1);
  });

  it('honours the concurrency ceiling', async () => {
    const tts = new FakeTTS({ maxConcurrent: 2, delays: {} });
    tts.processTextChunk('a, b, c, d, e, f, ');
    await tick(30);

    expect(tts.concurrentPeak).toBeLessThanOrEqual(2);
  });

  it('drops queued and in-flight work on barge-in', async () => {
    const tts = new FakeTTS({ delays: { 'one,': 50, 'two,': 50 } });
    const seen = collect(tts);

    tts.processTextChunk('one, two, three. ');
    await tick(5); // requests are out, none has returned
    tts.clear();
    await tick(120);

    expect(seen).toEqual([]);
  });

  it('accepts new text after a barge-in', async () => {
    const tts = new FakeTTS();
    const seen = collect(tts);

    tts.processTextChunk('discard this, ');
    tts.clear();
    tts.processTextChunk('keep this. ');
    await tick(30);

    expect(seen).toEqual(['keep this.']);
  });

  it('does not stall the queue when one clause fails', async () => {
    const tts = new FakeTTS();
    tts.failOn = 'two,';
    const seen = collect(tts);

    tts.processTextChunk('one, two, three. ');
    await tick(60);

    // The failure is skipped; the clause after it still plays.
    expect(seen).toEqual(['one,', 'three.']);
  });

  it('emits the tail on flush', async () => {
    const tts = new FakeTTS();
    const seen = collect(tts);

    tts.processTextChunk('a short reply');
    tts.flush();
    await tick(30);

    expect(seen.join(' ')).toContain('reply');
  });

  it('requires subclasses to implement _synthesize', async () => {
    const bare = new StreamingTTSBase();
    await expect(bare._synthesize('x')).rejects.toThrow('must implement _synthesize');
  });
});
