import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { VoiceSandbox } from '../VoiceSandbox';
import { loadAgentPerformance } from '../../lib/conversations';
import {
  rupees, mmss, onDate,
  OUTCOME_LABEL, LANGUAGE_LABEL, NEEDS_HUMAN,
  type Conversation, type AgentPerformance, type Outcome, type Language,
} from '../../lib/collections';

const DEVANAGARI: Language[] = ['hi', 'mr'];
const scriptClass = (lang: Language) => (DEVANAGARI.includes(lang) ? 'font-deva' : '');

/** Vermilion marks only what a person has to deal with. Nothing else may use it. */
const needsPerson = (row: Conversation) => row.escalate || NEEDS_HUMAN.includes(row.outcome);

const outcomeTone = (outcome: Outcome, escalate: boolean): string => {
  if (escalate || NEEDS_HUMAN.includes(outcome)) return 'text-signal';
  if (outcome === 'promise_to_pay') return 'text-settled';
  if (outcome === 'partial_promise') return 'text-dpd-1';
  return 'text-ink-3';
};

/**
 * The first thing a new account sees, and usually the worst screen in any
 * product. It is a path rather than an apology: three steps, each producing
 * something real. The band carries the next step instead of a statistic, because
 * there are no statistics yet and inventing some is how the old dashboard went
 * wrong.
 */
const FirstRun: React.FC<{ onStart: () => void }> = ({ onStart }) => {

  const steps = [
    ['Write the script', 'What the agent says, and in which language. Start from a reminder call and change the wording.'],
    ['Call it yourself', 'Talk to it the way a borrower would. Say you will pay on the 18th, or that you have lost your job.'],
    ['See what it captured', 'The promise date, the reason they gave, and their own words — as data you could act on.'],
  ];

  return (
    <>
      <div className="bg-ink text-paper px-6 lg:px-10 py-8">
        <p className="font-display text-[26px] lg:text-[32px] leading-tight tracking-tight max-w-[34ch]">
          Your agent hasn’t spoken to anyone yet.
        </p>
        <p className="text-[15px] text-paper-2/60 mt-3 max-w-[52ch] leading-relaxed">
          Write what it should say, then call it yourself and hear how it handles a
          borrower who can’t pay this month.
        </p>
        <button
          onClick={onStart}
          className="mt-5 bg-signal text-paper text-[14px] font-semibold px-5 h-10 rounded-ui hover:opacity-90 transition-opacity"
        >
          Write your first script
        </button>
      </div>

      <div className="px-6 lg:px-10 pt-7">
        {steps.map(([title, body], i) => (
          <div
            key={title}
            className={`flex gap-5 py-5 ${i < 2 ? 'border-b border-rule' : ''} ${i > 0 ? 'opacity-45' : ''}`}
          >
            <span className="font-display text-[26px] leading-none w-8 shrink-0 tabular">{i + 1}</span>
            <div className="min-w-0">
              <div className="text-[16px] font-semibold mb-1">{title}</div>
              <p className="text-[14px] text-ink-2 leading-relaxed">{body}</p>
            </div>
            {i === 0 && <span className="text-[13px] text-signal shrink-0 pt-1">Start here</span>}
          </div>
        ))}
      </div>
    </>
  );
};

/** The band. One slot, carrying the last thing a borrower actually said. */
const Band: React.FC<{ latest: Conversation }> = ({ latest }) => (
  <div className="bg-ink text-paper px-6 lg:px-10 py-7">
    <div className="text-[13px] text-paper-2/45 mb-4">Last thing said</div>
    {latest.quote ? (
      <p
        className={`text-[25px] lg:text-[31px] leading-[1.34] tracking-tight max-w-[46ch] ${scriptClass(latest.language)}`}
        style={{ textWrap: 'pretty' }}
      >
        {latest.quote}
      </p>
    ) : (
      <p className="font-display text-[25px] leading-tight text-paper-2/70">
        {OUTCOME_LABEL[latest.outcome]}
      </p>
    )}
    <div className="flex items-baseline gap-3 mt-4 flex-wrap">
      <span className={`font-display text-[15px] text-signal ${scriptClass(latest.language)}`}>
        {latest.borrower}
      </span>
      <span className="text-[13px] text-paper-2/55 tabular">
        {[latest.loanId, latest.amountDue !== null ? rupees(latest.amountDue) : null, LANGUAGE_LABEL[latest.language]]
          .filter(Boolean).join(' · ')}
      </span>
      <span className="text-[13px] ml-auto tabular">
        {latest.promisedOn ? `will pay ${onDate(latest.promisedOn)}` : OUTCOME_LABEL[latest.outcome].toLowerCase()}
      </span>
    </div>
  </div>
);

/**
 * How the agent is doing.
 *
 * Not a call funnel. Queued → dialled → connected describes a pipeline that does
 * not exist until there is real dialling, and rendering one anyway would be the
 * same theatre as the invented trend deltas this product used to show.
 */
const Performance: React.FC<{ performance: AgentPerformance }> = ({ performance }) => {
  const max = Math.max(1, ...performance.byOutcome.map(o => o.count));
  const n = (v: number) => new Intl.NumberFormat('en-IN').format(v);

  return (
    <aside className="border-t lg:border-t-0 lg:border-l border-rule px-6 lg:px-7 py-7 space-y-6">
      <div>
        <div className="font-display text-[42px] leading-none font-semibold tabular">
          {n(performance.promised)}
        </div>
        <div className="text-[13px] text-ink-2 mt-1.5">promises captured</div>
        {performance.promisedValue > 0 && (
          <div className="text-[14px] mt-2.5 tabular">{rupees(performance.promisedValue)} committed</div>
        )}
      </div>

      <div className="border-t border-rule pt-5 space-y-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] text-ink-2">Calls tested</span>
          <span className="text-[14px] tabular">{n(performance.tested)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[14px] text-ink-2">Right person reached</span>
          <span className="text-[14px] tabular">{n(performance.rightParty)}</span>
        </div>
        <Link to="/conversations?needsHuman=1" className="flex items-baseline justify-between group">
          <span className="text-[14px] text-signal group-hover:underline">Needs a person</span>
          <span className="text-[14px] text-signal tabular">{n(performance.needsHuman)}</span>
        </Link>
      </div>

      {performance.byOutcome.length > 0 && (
        <div className="border-t border-rule pt-5">
          <div className="text-[13px] text-ink-2 mb-3.5">Outcomes</div>
          <div className="space-y-2.5">
            {performance.byOutcome.map(({ outcome, count }) => (
              <div key={outcome}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className={`text-[12px] ${outcomeTone(outcome, false)}`}>
                    {OUTCOME_LABEL[outcome]}
                  </span>
                  <span className="text-[12px] tabular">{count}</span>
                </div>
                <div className="h-1 bg-paper-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-ink-3"
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
};

/** What else came back, in the borrower's own words. */
const AlsoSaid: React.FC<{ rows: Conversation[] }> = ({ rows }) => (
  <div className="space-y-5">
    {rows.map(row => (
      <Link key={row.id} to={`/conversations/${row.id}`} className="flex gap-4 group">
        <span
          className={`text-[12px] w-[76px] shrink-0 pt-1 ${
            needsPerson(row) ? 'text-signal' : 'text-ink-3'
          }`}
        >
          {OUTCOME_LABEL[row.outcome].toLowerCase()}
        </span>
        <div className="min-w-0">
          {row.quote && (
            <p
              className={`text-[16px] leading-[1.45] text-ink group-hover:underline decoration-rule-strong underline-offset-4 ${scriptClass(row.language)}`}
              style={{ textWrap: 'pretty' }}
            >
              {row.quote}
            </p>
          )}
          <p className="text-[12px] text-ink-3 mt-1 tabular">
            <span className={scriptClass(row.language)}>{row.borrower}</span>
            {row.amountDue !== null ? ` · ${rupees(row.amountDue)}` : ''}
            {row.promisedOn ? ` on ${onDate(row.promisedOn)}` : ''}
            {` · ${LANGUAGE_LABEL[row.language]} · ${mmss(row.durationSec)}`}
          </p>
        </div>
      </Link>
    ))}
  </div>
);

export const TodayPage: React.FC = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<{
    performance: AgentPerformance;
    recent: Conversation[];
  } | null>(null);
  const [failed, setFailed] = useState(false);
  // Testing is the middle step of the only loop this product has, so it belongs
  // inside the product rather than behind a marketing-page modal.
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadAgentPerformance().then(setState).catch(err => {
      console.error('Could not load calls:', err);
      setFailed(true);
    });
  }, []);

  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });

  if (failed) {
    return (
      <div className="p-6 lg:p-10">
        <p className="text-[15px] text-ink-2">
          Couldn’t load your calls. <button onClick={() => location.reload()} className="text-signal hover:underline">Try again</button>
        </p>
      </div>
    );
  }

  if (!state) {
    return <div className="p-10"><div className="h-7 w-40 bg-paper-2 rounded-ui animate-pulse" /></div>;
  }

  const { performance, recent } = state;
  const isFirstRun = performance.tested === 0;

  return (
    <div className="min-h-full bg-paper">
      <header className="flex items-baseline gap-4 px-6 lg:px-10 pt-7 pb-5 flex-wrap">
        <h1 className="font-display text-[27px] font-semibold tracking-tight">Collections</h1>
        <span className="text-[13px] text-ink-3 tabular">{today}</span>
        {!isFirstRun && (
          <button
            onClick={() => setTesting(true)}
            className="ml-auto border border-ink text-[14px] font-medium px-4 h-9 rounded-ui inline-flex items-center hover:bg-paper-2 transition-colors"
          >
            Test a call
          </button>
        )}
      </header>

      {isFirstRun ? <FirstRun onStart={() => navigate('/scripts')} /> : (
        <>
          <Band latest={recent[0]} />

          <div className="grid lg:grid-cols-[1fr_280px]">
            <section className="px-6 lg:px-10 py-7 min-w-0">
              <div className="flex items-baseline gap-3 mb-5">
                <h2 className="font-display text-[18px] font-semibold">Also said today</h2>
                <Link
                  to="/conversations"
                  className="text-[13px] text-ink-3 hover:text-signal transition-colors ml-auto tabular"
                >
                  {performance.tested} conversation{performance.tested === 1 ? '' : 's'}
                </Link>
              </div>
              <AlsoSaid rows={recent.slice(1, 6)} />
            </section>

            <Performance performance={performance} />
          </div>
        </>
      )}
      <VoiceSandbox
        open={testing}
        onClose={() => {
          setTesting(false);
          // The call it just made is the reason this screen exists.
          loadAgentPerformance().then(setState).catch(() => {});
        }}
      />
    </div>
  );
};

export default TodayPage;
