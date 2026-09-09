/**
 * In-process latency percentile recorder.
 *
 * Every timing in this codebase used to go straight into a `logger.info` string,
 * which meant p50/p95/p99 were unknowable. This keeps a fixed-capacity ring of
 * recent samples per metric and computes exact percentiles by sorting on read.
 *
 * A ring of 1000 float64s is 8 KB per metric, and sorting 1000 elements on a
 * `/metrics` request is cheap enough that a t-digest would be false economy.
 */

const CAPACITY = 1000;

/** @type {Map<string, {ring: Float64Array, next: number, filled: number, total: number}>} */
const metrics = new Map();

const getSeries = (name) => {
  let series = metrics.get(name);
  if (!series) {
    series = { ring: new Float64Array(CAPACITY), next: 0, filled: 0, total: 0 };
    metrics.set(name, series);
  }
  return series;
};

/**
 * Record one observation. O(1).
 * @param {string} name  dotted metric name, e.g. 'turn.mouth_to_ear'
 * @param {number} ms    duration in milliseconds
 */
export const record = (name, ms) => {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return;

  const series = getSeries(name);
  series.ring[series.next] = ms;
  series.next = (series.next + 1) % CAPACITY;
  if (series.filled < CAPACITY) series.filled += 1;
  series.total += 1;
};

/**
 * Convenience wrapper: returns a function that records the elapsed time when called.
 * @param {string} name
 * @returns {() => number} stop function, returns the elapsed ms it recorded
 */
export const startTimer = (name) => {
  const start = performance.now();
  return () => {
    const elapsed = performance.now() - start;
    record(name, elapsed);
    return elapsed;
  };
};

// Nearest-rank percentile on an ascending array. p is 0..100.
const percentileOf = (sorted, p) => {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.min(sorted.length - 1, Math.max(0, rank));
  return sorted[index];
};

const round = (n) => (n === null ? null : Math.round(n * 10) / 10);

/**
 * Percentile summary for one metric, or null if nothing has been recorded.
 * `count` is the lifetime total; `window` is how many samples the percentiles
 * were actually computed over (capped at CAPACITY).
 */
export const snapshot = (name) => {
  const series = metrics.get(name);
  if (!series || series.filled === 0) return null;

  const sorted = Array.prototype.slice
    .call(series.ring, 0, series.filled)
    .sort((a, b) => a - b);

  let sum = 0;
  for (const value of sorted) sum += value;

  return {
    count: series.total,
    window: series.filled,
    mean: round(sum / sorted.length),
    p50: round(percentileOf(sorted, 50)),
    p90: round(percentileOf(sorted, 90)),
    p95: round(percentileOf(sorted, 95)),
    p99: round(percentileOf(sorted, 99)),
    p100: round(sorted[sorted.length - 1]),
  };
};

/** Percentile summaries for every metric recorded so far, keyed by name. */
export const snapshotAll = () => {
  const out = {};
  for (const name of [...metrics.keys()].sort()) {
    const snap = snapshot(name);
    if (snap) out[name] = snap;
  }
  return out;
};

/** @type {Map<string, number>} */
const counters = new Map();

/**
 * Increment a plain counter. For things that are rates rather than durations,
 * such as how often speculative prefill is adopted.
 */
export const count = (name, delta = 1) => {
  counters.set(name, (counters.get(name) || 0) + delta);
};

/** Current counter values, keyed by name. */
export const counterSnapshot = () => Object.fromEntries([...counters.entries()].sort());

/** Drop all samples and counters. Used by tests. */
export const reset = () => {
  metrics.clear();
  counters.clear();
};

export default { record, startTimer, snapshot, snapshotAll, count, counterSnapshot, reset };
