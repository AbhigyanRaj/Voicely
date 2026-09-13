/**
 * Days past due, and how a lender talks about them.
 *
 * The bucket is derived from the due date rather than stored by the caller, so
 * it cannot disagree with the date it came from. It IS stored on the call
 * afterwards, because which bucket a borrower was in when they were phoned is a
 * fact about that call -- recomputing it a week later would silently rewrite
 * history.
 *
 * Mirrors the `Bucket` union in frontend/src/lib/collections.ts.
 */

/** Upper bound of days past due for each bucket, in order. */
const LADDER = [
  { bucket: 'clear', maxDays: 0 },
  { bucket: '0', maxDays: 7 },
  { bucket: '1', maxDays: 30 },
  { bucket: '2', maxDays: 60 },
  { bucket: '3', maxDays: Infinity },
];

export const BUCKET_LABEL = {
  clear: 'Current',
  '0': '1-7 days',
  '1': '8-30 days',
  '2': '31-60 days',
  '3': '60+ days',
};

/**
 * Whole days between a due date and a reference point.
 *
 * Compared at day granularity, not by millisecond: a payment due this morning is
 * not "0.4 days late", and a lender would never describe it that way.
 */
export function daysPastDue(dueDate, asOf = new Date()) {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;

  const startOfDay = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((startOfDay(new Date(asOf)) - startOfDay(due)) / 86400000);
}

/** Which bucket a due date falls in. Null when there is no date to judge. */
export function bucketFor(dueDate, asOf = new Date()) {
  const days = daysPastDue(dueDate, asOf);
  if (days === null) return null;
  return LADDER.find(step => days <= step.maxDays).bucket;
}

export default { bucketFor, daysPastDue, BUCKET_LABEL };
