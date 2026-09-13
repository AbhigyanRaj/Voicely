import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import {
  toConversation, rupees, mmss, onDate,
  OUTCOME_LABEL, LANGUAGE_LABEL, NEEDS_HUMAN,
  type CallRow, type Conversation, type Language,
} from '../../lib/collections';

const DEVANAGARI: Language[] = ['hi', 'mr'];
const scriptClass = (lang: Language) => (DEVANAGARI.includes(lang) ? 'font-deva' : '');

interface TranscriptLine {
  speaker: 'AI' | 'User';
  text: string;
  timestamp?: string;
}

const REASON_LABEL: Record<string, string> = {
  job_loss: 'Lost their job',
  medical: 'Medical',
  business_loss: 'Business loss',
  dispute: 'Disputes the amount',
  forgot: 'Forgot',
  travelling: 'Travelling',
  salary_delayed: 'Salary delayed',
  other: 'Other',
};

/** Ignore punctuation and spacing, which differ between transcript and extraction. */
const normalise = (s: string) =>
  (s || '').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Which transcript line produced the extraction.
 *
 * The analysis returns the borrower's own most informative sentence verbatim, so
 * the link between "18 Sep 2026" and the words that produced it is recoverable
 * rather than guessed. That link is the whole point of this screen: a collections
 * head has to believe the extraction before they will act on it, and "trust the
 * model" is not an answer.
 */
const findSourceLine = (transcript: TranscriptLine[], quote?: string | null): number => {
  if (!quote) return -1;
  const target = normalise(quote);
  if (!target) return -1;

  const exact = transcript.findIndex(l => l.speaker === 'User' && normalise(l.text) === target);
  if (exact !== -1) return exact;
  // The quote may be one sentence of a longer turn, or vice versa.
  return transcript.findIndex(l => {
    if (l.speaker !== 'User') return false;
    const line = normalise(l.text);
    return line.includes(target) || target.includes(line);
  });
};

export const ConversationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [call, setCall] = useState<CallRow & { liveTranscript?: TranscriptLine[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getCallDetails(id)
      .then((data: { call: CallRow & { liveTranscript?: TranscriptLine[] } }) => setCall(data.call))
      .catch((err: unknown) => {
        console.error('Could not load call:', err);
        setError('Couldn’t load this conversation.');
      });
  }, [id]);

  if (error) {
    return (
      <div className="p-6 lg:p-9">
        <Link to="/conversations" className="text-[13px] text-ink-3 hover:text-signal">← All conversations</Link>
        <p className="text-[15px] text-ink-2 mt-6">{error}</p>
      </div>
    );
  }

  if (!call) {
    return <div className="p-9"><div className="h-7 w-48 bg-paper-2 rounded-ui animate-pulse" /></div>;
  }

  const row: Conversation = toConversation(call);
  const transcript: TranscriptLine[] = call.liveTranscript || [];
  const sourceIndex = findSourceLine(transcript, row.quote);
  const needsPerson = row.escalate || NEEDS_HUMAN.includes(row.outcome);
  const agentName = (call.moduleId?.name || 'Agent').split('—')[0].trim();

  const captured: [string, React.ReactNode][] = [
    ['Amount', row.amountDue !== null ? rupees(row.amountDue) : '—'],
    ['Right person', row.rightPartyContact
      ? 'Confirmed'
      : <span className="text-ink-3">Not confirmed</span>],
    ['Reason', row.reason ? (REASON_LABEL[row.reason] ?? row.reason) : '—'],
    ['Needs a person', needsPerson
      ? <span className="text-signal">Yes</span>
      : <span className="text-ink-3">No</span>],
  ];

  return (
    <div className="min-h-full bg-paper">
      <header className="px-6 lg:px-9 pt-6 pb-5 border-b border-rule">
        <Link to="/conversations" className="text-[13px] text-ink-3 hover:text-signal transition-colors">
          ← All conversations
        </Link>
        <div className="flex items-baseline gap-3.5 mt-2.5 flex-wrap">
          <h1 className={`font-display text-[24px] font-semibold ${scriptClass(row.language)}`}>
            {row.borrower}
          </h1>
          <span className="text-[13px] text-ink-2 tabular">
            {[
              row.loanId,
              row.amountDue !== null ? rupees(row.amountDue) : null,
              call.borrower?.dueDate ? `due ${onDate(call.borrower.dueDate)}` : null,
              LANGUAGE_LABEL[row.language],
            ].filter(Boolean).join(' · ')}
          </span>
          <span className="text-[13px] text-ink-3 ml-auto tabular">
            {new Date(row.at).toLocaleString('en-IN', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
            })} · {mmss(row.durationSec)}
          </span>
        </div>
      </header>

      <div className="grid lg:grid-cols-[1fr_320px]">

        <section className="px-6 lg:px-9 py-6 min-w-0">
          <div className="text-[13px] text-ink-3 mb-4">Transcript</div>

          {transcript.length === 0 ? (
            <p className="text-[14px] text-ink-2">
              No transcript was recorded for this call.
            </p>
          ) : (
            <div className="space-y-3.5">
              {transcript.map((line, i) => {
                const isSource = i === sourceIndex;
                return (
                  <div
                    key={i}
                    className={`flex gap-4 ${
                      isSource ? 'bg-paper-2 -mx-2.5 px-2.5 py-1.5 rounded-ui border-l-2 border-signal' : ''
                    }`}
                  >
                    <span
                      className={`font-display text-[13px] w-[60px] shrink-0 pt-0.5 ${
                        line.speaker === 'AI' ? 'text-signal' : 'text-ink-2'
                      }`}
                    >
                      {line.speaker === 'AI' ? agentName : row.borrower.split(' ')[0]}
                    </span>
                    <p className={`text-[16px] leading-relaxed ${scriptClass(row.language)}`}>
                      {line.text}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="border-t lg:border-t-0 lg:border-l border-rule px-6 lg:px-7 py-6">
          <div className="text-[13px] text-ink-3 mb-4">What it captured</div>

          <div className="mb-5">
            <div className="text-[12px] text-ink-3 mb-1">Outcome</div>
            <div className={`font-display text-[21px] font-semibold ${
              needsPerson ? 'text-signal' : row.outcome === 'promise_to_pay' ? 'text-settled' : 'text-ink'
            }`}>
              {OUTCOME_LABEL[row.outcome]}
            </div>
            {row.escalate && call.collections?.escalateReason && (
              <p className="text-[13px] text-ink-2 mt-1.5 leading-snug">
                {call.collections.escalateReason}
              </p>
            )}
          </div>

          {row.promisedOn && (
            <div className="border-t border-rule pt-4 mb-4">
              <div className="text-[12px] text-ink-3 mb-1">Promise date</div>
              <div className="font-display text-[22px] font-semibold tabular">
                {new Date(row.promisedOn).toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </div>
              {row.promisedAmount && row.promisedAmount !== row.amountDue && (
                <div className="text-[13px] text-ink-2 mt-1 tabular">{rupees(row.promisedAmount)}</div>
              )}
              {/* The trust mechanism: the field names the words it came from, and
                  those words are marked in the transcript beside it. */}
              {row.quote && sourceIndex !== -1 && (
                <div className="flex items-start gap-1.5 mt-2 text-signal">
                  <span className="text-[13px] leading-none pt-1">←</span>
                  <span className={`text-[12px] leading-snug ${scriptClass(row.language)}`}>
                    from “{row.quote}”
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="border-t border-rule pt-4 space-y-3">
            {captured.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] text-ink-2">{label}</span>
                <span className="text-[14px] tabular text-right">{value}</span>
              </div>
            ))}
          </div>

          {call.summary && (
            <div className="border-t border-rule mt-5 pt-4">
              <div className="text-[12px] text-ink-3 mb-1.5">Summary</div>
              <p className="text-[13px] text-ink-2 leading-relaxed">{call.summary}</p>
            </div>
          )}
        </aside>

      </div>
    </div>
  );
};

export default ConversationDetail;
