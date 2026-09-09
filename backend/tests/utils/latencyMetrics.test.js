import { record, snapshot, snapshotAll, reset } from '../../src/utils/latencyMetrics.js';

describe('latencyMetrics', () => {
  beforeEach(() => reset());

  it('computes exact percentiles over a known sample set', () => {
    for (let i = 1; i <= 100; i++) record('turn.mouth_to_ear', i);

    expect(snapshot('turn.mouth_to_ear')).toEqual({
      count: 100,
      window: 100,
      mean: 50.5,
      p50: 50,
      p90: 90,
      p95: 95,
      p99: 99,
      p100: 100,
    });
  });

  it('is order independent', () => {
    for (const value of [90, 10, 50, 100, 30]) record('m', value);
    const snap = snapshot('m');
    expect(snap.p50).toBe(50);
    expect(snap.p100).toBe(100);
  });

  it('keeps a lifetime count while percentiles use the recent window', () => {
    for (let i = 1; i <= 2500; i++) record('m', i);

    const snap = snapshot('m');
    expect(snap.count).toBe(2500); // every observation counted
    expect(snap.window).toBe(1000); // most recent 1000 retained
    expect(snap.p100).toBe(2500); // the ring holds 1501..2500
    expect(snap.p50).toBe(2000);
  });

  it('ignores values that are not usable durations', () => {
    for (const junk of [-1, NaN, Infinity, '12', null, undefined]) record('m', junk);
    expect(snapshot('m')).toBeNull();
  });

  it('returns null for a metric with no samples', () => {
    expect(snapshot('never.recorded')).toBeNull();
  });

  it('reports a single sample as every percentile', () => {
    record('m', 7);
    expect(snapshot('m')).toMatchObject({ count: 1, p50: 7, p99: 7, p100: 7 });
  });

  it('lists only metrics that have samples, sorted by name', () => {
    record('b.second', 1);
    record('a.first', 1);
    expect(Object.keys(snapshotAll())).toEqual(['a.first', 'b.second']);
  });
});
