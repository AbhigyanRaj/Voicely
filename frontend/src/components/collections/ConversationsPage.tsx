import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { loadConversations } from '../../lib/conversations';
import {
  rupees, mmss, atTime, onDate,
  OUTCOME_LABEL, LANGUAGE_LABEL, LANGUAGES_IN_USE, NEEDS_HUMAN,
  type Conversation, type Outcome, type Language,
} from '../../lib/collections';

const DEVANAGARI: Language[] = ['hi', 'mr'];
const scriptClass = (lang: Language) => (DEVANAGARI.includes(lang) ? 'font-deva' : '');

const needsPerson = (row: Conversation) => row.escalate || NEEDS_HUMAN.includes(row.outcome);

const outcomeTone = (row: Conversation): string => {
  if (needsPerson(row)) return 'text-signal';
  if (row.outcome === 'promise_to_pay') return 'text-settled';
  if (row.outcome === 'partial_promise') return 'text-dpd-1';
  return 'text-ink-3';
};

/** The filters worth having. Each maps to a query the database can serve. */
const VIEWS: { id: string; label: string; outcome?: Outcome[]; needsHuman?: boolean }[] = [
  { id: 'all', label: 'All' },
  { id: 'promised', label: 'Promised', outcome: ['promise_to_pay', 'partial_promise'] },
  { id: 'needs_human', label: 'Needs a person', needsHuman: true },
];

/**
 * Every test call, newest first.
 *
 * The dense screen. Each row carries the borrower's own sentence as a second
 * line, because a disposition code is what a call centre gives you and the
 * sentence is what this gives you -- hiding it behind a click would throw away
 * the only thing that distinguishes the two.
 */
export const ConversationsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<Conversation[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);

  // Today links straight to the queue that needs attention, so the view has to
  // be readable from the URL rather than held only in component state.
  const view = params.get('needsHuman') === '1' ? 'needs_human' : (params.get('view') || 'all');
  const language = params.get('language') || '';

  useEffect(() => {
    const active = VIEWS.find(v => v.id === view) ?? VIEWS[0];
    setRows(null);
    setFailed(false);
    loadConversations({
      outcome: active.outcome,
      needsHuman: active.needsHuman,
      language: language || undefined,
      limit: 100,
    })
      .then(page => { setRows(page.rows); setTotal(page.total); })
      .catch(err => { console.error('Could not load conversations:', err); setFailed(true); });
  }, [view, language]);

  const setView = (id: string) => {
    const next = new URLSearchParams(params);
    next.delete('needsHuman');
    if (id === 'all') next.delete('view'); else next.set('view', id);
    setParams(next, { replace: true });
  };

  const setLanguage = (code: string) => {
    const next = new URLSearchParams(params);
    if (code) next.set('language', code); else next.delete('language');
    setParams(next, { replace: true });
  };

  return (
    <div className="min-h-full bg-paper">
      <header className="flex items-baseline gap-4 px-6 lg:px-9 pt-7 pb-4 flex-wrap">
        <h1 className="font-display text-[27px] font-semibold tracking-tight">Conversations</h1>
        {rows && (
          <span className="text-[13px] text-ink-3 tabular">
            {total} call{total === 1 ? '' : 's'}
          </span>
        )}
      </header>

      <div className="flex gap-2 px-6 lg:px-9 pb-4 items-center flex-wrap">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-3 h-7 rounded-ui text-[13px] border transition-colors ${
              view === v.id
                ? 'border-ink text-ink'
                : v.needsHuman
                  ? 'border-rule text-signal hover:border-rule-strong'
                  : 'border-rule text-ink-2 hover:border-rule-strong'
            }`}
          >
            {v.label}
          </button>
        ))}

        <span className="w-px h-4 bg-rule mx-1" />

        <select
          value={language}
          onChange={e => setLanguage(e.target.value)}
          className="px-3 h-7 rounded-ui text-[13px] border border-rule text-ink-2 bg-paper hover:border-rule-strong transition-colors cursor-pointer"
        >
          <option value="">Any language</option>
          {LANGUAGES_IN_USE.map(code => (
            <option key={code} value={code}>{LANGUAGE_LABEL[code]}</option>
          ))}
        </select>
      </div>

      <div className="px-6 lg:px-9 pb-10">
        {failed && (
          <p className="text-[15px] text-ink-2 py-8">
            Couldn’t load conversations.{' '}
            <button onClick={() => location.reload()} className="text-signal hover:underline">Try again</button>
          </p>
        )}

        {!failed && rows === null && (
          <div className="space-y-3 pt-4">
            {[0, 1, 2].map(i => <div key={i} className="h-10 bg-paper-2 rounded-ui animate-pulse" />)}
          </div>
        )}

        {rows?.length === 0 && (
          <div className="py-14 max-w-[42ch]">
            <p className="font-display text-[20px] font-semibold mb-2">
              {view === 'all' ? 'No calls yet' : 'Nothing here'}
            </p>
            <p className="text-[14px] text-ink-2 leading-relaxed">
              {view === 'all'
                ? <>Call your agent once and what it captured will show up here. <Link to="/scripts" className="text-signal hover:underline">Go to scripts</Link></>
                : 'Try a different view — nothing matches this filter.'}
            </p>
          </div>
        )}

        {rows && rows.length > 0 && (
          <>
            {/* Column heads on a single rule, not a filled header bar: the rows
                are the content and the heads should not compete with them. */}
            <div className="grid grid-cols-[64px_1fr_86px_132px_138px_54px] gap-4 pb-2 border-b border-ink text-[12px] text-ink-3">
              <span>When</span><span>Borrower</span><span>Language</span>
              <span>Outcome</span><span>Captured</span><span className="text-right">Length</span>
            </div>

            {rows.map(row => (
              <Link
                key={row.id}
                to={`/conversations/${row.id}`}
                className="grid grid-cols-[64px_1fr_86px_132px_138px_54px] gap-4 py-3 border-b border-rule items-baseline hover:bg-paper-2/50 transition-colors -mx-2 px-2"
              >
                <span className="text-[13px] text-ink-3 tabular">{atTime(row.at)}</span>

                <div className="min-w-0">
                  <div className="text-[15px] truncate">
                    <span className={scriptClass(row.language)}>{row.borrower}</span>
                    {(row.loanId || row.amountDue !== null) && (
                      <span className="text-[12px] text-ink-3 ml-2 tabular">
                        {[row.loanId, row.amountDue !== null ? rupees(row.amountDue) : null]
                          .filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                  {row.quote && (
                    <p className={`text-[13px] text-ink-2 mt-1 leading-snug line-clamp-1 ${scriptClass(row.language)}`}>
                      {row.quote}
                    </p>
                  )}
                </div>

                <span className={`text-[13px] text-ink-2 ${scriptClass(row.language)}`}>
                  {LANGUAGE_LABEL[row.language]}
                </span>

                <span className={`text-[13px] ${outcomeTone(row)}`}>
                  {OUTCOME_LABEL[row.outcome]}
                </span>

                <span className="text-[13px] tabular">
                  {needsPerson(row)
                    ? <span className="text-signal">Needs a person</span>
                    : row.promisedOn
                      ? `${onDate(row.promisedOn)}${row.promisedAmount ? ` · ${rupees(row.promisedAmount)}` : ''}`
                      : <span className="text-ink-3">—</span>}
                </span>

                <span className="text-[13px] text-ink-3 text-right tabular">{mmss(row.durationSec)}</span>
              </Link>
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default ConversationsPage;
