/**
 * The shape of a collections conversation, shared by every screen.
 *
 * These unions mirror the server: `Outcome` matches `COLLECTION_OUTCOMES` in
 * backend/src/config/gemini.js and the Call schema enum, and `Bucket` matches
 * backend/src/config/buckets.js. A mismatch means an outcome arrives that the UI
 * has no label or colour for, so they are kept in step deliberately.
 */

/** Days past due. The spine of the product: every colour and sort keys off it. */
export type Bucket = 'clear' | '0' | '1' | '2' | '3';

export const BUCKET_LABEL: Record<Bucket, string> = {
  clear: 'Current',
  '0': '1–7 days',
  '1': '8–30 days',
  '2': '31–60 days',
  '3': '60+ days',
};

/** Tailwind token per bucket. Defined once so charts, chips and rows agree. */
export const BUCKET_TEXT: Record<Bucket, string> = {
  clear: 'text-dpd-clear',
  '0': 'text-dpd-0',
  '1': 'text-dpd-1',
  '2': 'text-dpd-2',
  '3': 'text-dpd-3',
};

export const BUCKET_BG: Record<Bucket, string> = {
  clear: 'bg-dpd-clear',
  '0': 'bg-dpd-0',
  '1': 'bg-dpd-1',
  '2': 'bg-dpd-2',
  '3': 'bg-dpd-3',
};

/** What the borrower actually said, as structured data. The product's output. */
export type Outcome =
  | 'promise_to_pay'
  | 'partial_promise'
  | 'dispute'
  | 'hardship'
  | 'callback'
  | 'refused'
  | 'wrong_number'
  | 'no_answer';

export const OUTCOME_LABEL: Record<Outcome, string> = {
  promise_to_pay: 'Promised to pay',
  partial_promise: 'Promised part',
  dispute: 'Disputes amount',
  hardship: 'Hardship',
  callback: 'Asked to call back',
  refused: 'Refused',
  wrong_number: 'Wrong number',
  no_answer: 'No answer',
};

/** Outcomes a human has to look at. Drives the "Needs you" queue. */
export const NEEDS_HUMAN: Outcome[] = ['dispute', 'hardship', 'refused'];

export type Language = 'hi' | 'ta' | 'te' | 'mr' | 'bn' | 'en';

/** Offered in the picker and the filters. English last: it is the exception here. */
export const LANGUAGES_IN_USE: Language[] = ['hi', 'mr', 'ta', 'te', 'bn', 'en'];

export const LANGUAGE_LABEL: Record<Language, string> = {
  hi: 'हिन्दी',
  ta: 'தமிழ்',
  te: 'తెలుగు',
  mr: 'मराठी',
  bn: 'বাংলা',
  en: 'English',
};

/** Indian digit grouping: ₹12,84,000 rather than ₹1,284,000. */
export const rupees = (n: number, compact = false): string => {
  if (compact && n >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (compact && n >= 100000) return `₹${(n / 100000).toFixed(1)} L`;
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;
};

export const mmss = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** One call as the API returns it on a list. */
export interface CallRow {
  _id: string;
  customerName: string;
  selectedLanguage: string;
  duration: number;
  createdAt: string;
  summary?: string;
  moduleId?: { name: string };
  borrower?: {
    loanId?: string | null;
    amountDue?: number | null;
    dueDate?: string | null;
    bucket?: Bucket | null;
  };
  collections?: {
    outcome?: Outcome | null;
    promisedOn?: string | null;
    promisedAmount?: number | null;
    reason?: string | null;
    rightPartyContact?: boolean;
    escalate?: boolean;
    escalateReason?: string | null;
    borrowerQuote?: string | null;
  };
}

/** What a test call produced, flattened for rendering. */
export interface Conversation {
  id: string;
  borrower: string;
  loanId: string | null;
  language: Language;
  amountDue: number | null;
  bucket: Bucket | null;
  outcome: Outcome;
  promisedOn?: string;
  promisedAmount?: number;
  quote?: string;
  reason?: string | null;
  escalate: boolean;
  rightPartyContact: boolean;
  at: string;
  durationSec: number;
}

/** Codes the API returns are BCP-47-ish; the UI's Language union is not. */
const toLanguage = (code?: string): Language => {
  const base = (code || 'en').split('-')[0];
  return (['hi', 'ta', 'te', 'mr', 'bn'] as const).includes(base as never)
    ? (base as Language)
    : 'en';
};

/** Flatten an API row. Everything optional server-side gets a defined shape. */
export function toConversation(row: CallRow): Conversation {
  const c = row.collections || {};
  return {
    id: row._id,
    borrower: row.customerName || 'Unknown',
    loanId: row.borrower?.loanId ?? null,
    language: toLanguage(row.selectedLanguage),
    amountDue: row.borrower?.amountDue ?? null,
    bucket: row.borrower?.bucket ?? null,
    // A call that never completed has no outcome; it is not an answered call.
    outcome: c.outcome ?? 'no_answer',
    promisedOn: c.promisedOn ?? undefined,
    promisedAmount: c.promisedAmount ?? undefined,
    quote: c.borrowerQuote ?? undefined,
    reason: c.reason ?? null,
    escalate: Boolean(c.escalate),
    rightPartyContact: Boolean(c.rightPartyContact),
    at: row.createdAt,
    durationSec: row.duration || 0,
  };
}

/** What Today reports: how the agent is doing, not how a pipeline is flowing. */
export interface AgentPerformance {
  tested: number;
  promised: number;
  promisedValue: number;
  rightParty: number;
  needsHuman: number;
  byOutcome: { outcome: Outcome; count: number }[];
}

export function summarise(rows: Conversation[]): AgentPerformance {
  const counts = new Map<Outcome, number>();
  let promised = 0;
  let promisedValue = 0;
  let rightParty = 0;
  let needsHuman = 0;

  for (const row of rows) {
    counts.set(row.outcome, (counts.get(row.outcome) || 0) + 1);
    if (row.outcome === 'promise_to_pay' || row.outcome === 'partial_promise') {
      promised += 1;
      promisedValue += row.promisedAmount ?? row.amountDue ?? 0;
    }
    if (row.rightPartyContact) rightParty += 1;
    if (row.escalate || NEEDS_HUMAN.includes(row.outcome)) needsHuman += 1;
  }

  return {
    tested: rows.length,
    promised,
    promisedValue,
    rightParty,
    needsHuman,
    byOutcome: [...counts.entries()]
      .map(([outcome, count]) => ({ outcome, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** Short, locale-correct time for a row. */
export const atTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });

export const onDate = (iso: string | undefined | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
