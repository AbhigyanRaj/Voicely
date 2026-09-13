import { bucketFor, daysPastDue, BUCKET_LABEL } from '../../src/config/buckets.js';

const ASOF = new Date('2026-09-13T10:00:00Z');
const days = (n) => new Date(Date.UTC(2026, 8, 13 - n));

describe('daysPastDue', () => {
  it('counts whole days, not fractions', () => {
    // A payment due this morning is not "0.4 days late", and no lender would
    // describe it that way.
    expect(daysPastDue(new Date('2026-09-13T23:00:00Z'), ASOF)).toBe(0);
    expect(daysPastDue(new Date('2026-09-13T00:01:00Z'), ASOF)).toBe(0);
  });

  it('counts a date in the past', () => {
    expect(daysPastDue(days(1), ASOF)).toBe(1);
    expect(daysPastDue(days(30), ASOF)).toBe(30);
  });

  it('goes negative for a date still ahead', () => {
    expect(daysPastDue(new Date(Date.UTC(2026, 8, 20)), ASOF)).toBe(-7);
  });

  it('returns null rather than NaN for missing or junk input', () => {
    expect(daysPastDue(null, ASOF)).toBeNull();
    expect(daysPastDue(undefined, ASOF)).toBeNull();
    expect(daysPastDue('not a date', ASOF)).toBeNull();
  });
});

describe('bucketFor', () => {
  it.each([
    [-5, 'clear'], [0, 'clear'],
    [1, '0'], [7, '0'],
    [8, '1'], [30, '1'],
    [31, '2'], [60, '2'],
    [61, '3'], [400, '3'],
  ])('%i days past due is bucket %s', (n, expected) => {
    expect(bucketFor(days(n), ASOF)).toBe(expected);
  });

  it('has no opinion without a due date', () => {
    expect(bucketFor(null, ASOF)).toBeNull();
  });

  it('labels every bucket it can return', () => {
    for (const n of [-1, 3, 20, 45, 90]) {
      expect(BUCKET_LABEL[bucketFor(days(n), ASOF)]).toBeTruthy();
    }
  });

  it('accepts a date string as well as a Date', () => {
    expect(bucketFor('2026-09-10', ASOF)).toBe('0');
  });
});
