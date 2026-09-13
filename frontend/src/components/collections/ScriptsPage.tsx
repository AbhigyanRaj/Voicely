import React, { useEffect, useState } from 'react';
import { getUserModules, addVoiceModule, updateVoiceModule, deleteVoiceModule, type VoiceModule } from '../../lib/auth';
import { VoiceSandbox } from '../VoiceSandbox';
import { LANGUAGES, CARTESIA_VOICES, defaultVoiceFor, usesDevanagari } from '../../lib/ttsConfig';

/**
 * What the agent says.
 *
 * Shown as the conversation it produces rather than as a form, and labelled in
 * plain words -- "Opens with", "Who it is", "What it needs to find out" -- never
 * "System Prompt". This replaces a four-step modal wizard whose fourth step
 * ("Skills": Deal Closer, Real Estate Qualifier) was never submitted anywhere and
 * whose choices were all sales verticals.
 *
 * The rules a script may NOT override are stated beside it rather than hidden.
 * A lender's compliance officer will ask what the agent is allowed to say, and
 * the answer should be on the screen.
 */

/** Held to on every call, whatever the script says. Mirrors buildSystemPrompt. */
const ALWAYS_APPLIES = [
  'Confirms who it is speaking to before mentioning money',
  'Never threatens, never mentions legal action',
  'States the amount and date plainly, once',
  'Accepts a part payment without pushing for more',
  'Stops collecting and hands off on genuine hardship',
  'Says it is automated if asked',
];

const STARTER = {
  name: 'EMI reminder',
  systemPrompt:
    'You are calling on behalf of a lender to remind a borrower that this month’s EMI is still outstanding, and to find out when they can pay.\n\nYour tone is calm, respectful and unhurried. You are not a recovery agent — you are a reminder. The borrower may be in genuine difficulty; treat them with respect.',
  questions: [
    'Am I speaking with the right person?',
    'This month’s EMI is still outstanding — were you aware of that?',
    'When do you think you will be able to pay? Can you give me a date?',
    'Is there anything making the payment difficult that we should know about?',
  ],
};

export const ScriptsPage: React.FC = () => {
  const [scripts, setScripts] = useState<VoiceModule[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The editing copy. Held apart from the saved list so a half-typed question is
  // never written, and so Cancel means something.
  const [draft, setDraft] = useState<{
    name: string; systemPrompt: string; questions: string[];
    selectedLanguage: string; selectedVoice: string;
  } | null>(null);

  const refresh = () =>
    getUserModules()
      .then(list => {
        setScripts(list);
        if (list.length > 0 && !activeId) select(list[0]);
      })
      .catch(err => { console.error(err); setError('Couldn’t load your scripts.'); });

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const select = (m: VoiceModule) => {
    setActiveId(m._id || m.id || null);
    setDraft({
      name: m.name,
      systemPrompt: m.systemPrompt || '',
      questions: (m.questions || []).map(q => (typeof q === 'string' ? q : q.question)),
      selectedLanguage: m.selectedLanguage || 'hi',
      selectedVoice: m.selectedVoice || defaultVoiceFor(m.selectedLanguage || 'hi'),
    });
  };

  const createStarter = async () => {
    setSaving(true);
    try {
      await addVoiceModule(STARTER.name, STARTER.questions, STARTER.systemPrompt, 'cartesia', 'hi', defaultVoiceFor('hi'));
      setActiveId(null);
      await refresh();
    } catch (err) {
      console.error(err);
      setError('Couldn’t create the script.');
    } finally { setSaving(false); }
  };

  const save = async () => {
    if (!activeId || !draft) return;
    setSaving(true);
    try {
      await updateVoiceModule(activeId, {
        name: draft.name,
        systemPrompt: draft.systemPrompt,
        selectedLanguage: draft.selectedLanguage,
        selectedVoice: draft.selectedVoice,
        questions: draft.questions
          .filter(q => q.trim())
          .map((question, i) => ({ question, order: i + 1, required: true })),
      } as Partial<VoiceModule>);
      await refresh();
    } catch (err) {
      console.error(err);
      setError('Couldn’t save.');
    } finally { setSaving(false); }
  };

  const remove = async (id: string, name: string) => {
    // There was no confirmation at all before: one click deleted the agent.
    if (!window.confirm(`Delete “${name}”? This cannot be undone.`)) return;
    await deleteVoiceModule(id).catch(err => { console.error(err); setError('Couldn’t delete.'); });
    setActiveId(null);
    setDraft(null);
    refresh();
  };

  if (scripts === null) {
    return <div className="p-9"><div className="h-7 w-40 bg-paper-2 rounded-ui animate-pulse" /></div>;
  }

  if (scripts.length === 0) {
    return (
      <div className="min-h-full bg-paper px-6 lg:px-9 py-7">
        <h1 className="font-display text-[27px] font-semibold tracking-tight mb-7">Scripts</h1>
        <div className="max-w-[46ch]">
          <p className="font-display text-[21px] font-semibold mb-2">Nothing written yet</p>
          <p className="text-[14px] text-ink-2 leading-relaxed mb-6">
            A script is what the agent says: how it introduces itself, and what it
            needs to find out. Start from a reminder call and change the wording.
          </p>
          <button
            onClick={createStarter}
            disabled={saving}
            className="bg-signal text-paper text-[14px] font-semibold px-5 h-10 rounded-ui hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {saving ? 'Creating…' : 'Start from a reminder call'}
          </button>
          {error && <p className="text-[13px] text-signal mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  const voices = CARTESIA_VOICES[draft?.selectedLanguage ?? 'hi'] || [];

  return (
    <div className="min-h-full bg-paper">
      <header className="flex items-baseline gap-4 px-6 lg:px-9 pt-7 pb-4 flex-wrap border-b border-rule">
        <h1 className="font-display text-[27px] font-semibold tracking-tight">
          {draft?.name || 'Scripts'}
        </h1>
        {scripts.length > 1 && (
          <select
            value={activeId ?? ''}
            onChange={e => {
              const m = scripts.find(s => (s._id || s.id) === e.target.value);
              if (m) select(m);
            }}
            className="text-[13px] border border-rule rounded-ui px-2 h-7 bg-paper text-ink-2 cursor-pointer"
          >
            {scripts.map(m => (
              <option key={m._id || m.id} value={m._id || m.id}>{m.name}</option>
            ))}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="border border-rule text-[14px] px-4 h-9 rounded-ui hover:border-rule-strong disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={() => setTesting(true)}
            className="bg-signal text-paper text-[14px] font-semibold px-5 h-9 rounded-ui hover:opacity-90 transition-opacity"
          >
            Test this agent
          </button>
        </div>
      </header>

      {error && <p className="text-[13px] text-signal px-6 lg:px-9 pt-3">{error}</p>}

      {draft && (
        <div className="grid lg:grid-cols-[1fr_300px]">

          <div className="px-6 lg:px-9 py-6 space-y-6 min-w-0">
            <div>
              <div className="text-[14px] font-semibold mb-1">Who it is</div>
              <p className="text-[13px] text-ink-3 mb-2.5">
                How it should carry itself. Write it the way you would brief a new agent.
              </p>
              <textarea
                value={draft.systemPrompt}
                onChange={e => setDraft({ ...draft, systemPrompt: e.target.value })}
                rows={6}
                className={`w-full border border-rule rounded-ui px-3.5 py-3 text-[15px] leading-relaxed bg-white focus:outline-none focus:border-ink transition-colors resize-none ${
                  usesDevanagari(draft.selectedLanguage) ? 'font-deva' : ''
                }`}
              />
            </div>

            <div>
              <div className="text-[14px] font-semibold mb-1">What it needs to find out</div>
              <p className="text-[13px] text-ink-3 mb-2.5">
                Worked into the conversation naturally, not read out as a list.
              </p>
              <div className="space-y-2">
                {draft.questions.map((q, i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <span className="text-[13px] text-ink-3 w-3 tabular">{i + 1}</span>
                    <input
                      value={q}
                      onChange={e => {
                        const next = [...draft.questions];
                        next[i] = e.target.value;
                        setDraft({ ...draft, questions: next });
                      }}
                      className={`flex-1 border border-rule rounded-ui px-3.5 py-2.5 text-[15px] bg-white focus:outline-none focus:border-ink transition-colors ${
                        usesDevanagari(draft.selectedLanguage) ? 'font-deva' : ''
                      }`}
                    />
                    {draft.questions.length > 1 && (
                      <button
                        onClick={() => setDraft({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })}
                        className="text-ink-3 hover:text-signal text-[15px] px-1 transition-colors"
                        aria-label="Remove question"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setDraft({ ...draft, questions: [...draft.questions, ''] })}
                  className="text-[13px] text-signal hover:underline ml-6"
                >
                  + Add a question
                </button>
              </div>
            </div>
          </div>

          <aside className="border-t lg:border-t-0 lg:border-l border-rule px-6 lg:px-7 py-6">
            <div className="text-[14px] font-semibold mb-1">Always applies</div>
            <p className="text-[13px] text-ink-3 mb-4 leading-relaxed">
              Held to these on every call, whatever the script says.
            </p>
            <div className="space-y-2.5">
              {ALWAYS_APPLIES.map(rule => (
                <p key={rule} className="text-[13px] text-ink-2 leading-snug">{rule}</p>
              ))}
            </div>

            <div className="border-t border-rule mt-6 pt-5">
              <div className="text-[14px] font-semibold mb-3">Language &amp; voice</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {LANGUAGES.map(l => (
                  <button
                    key={l.code}
                    onClick={() => setDraft({
                      ...draft,
                      selectedLanguage: l.code,
                      // A voice belongs to one language; it has to move with it.
                      selectedVoice: defaultVoiceFor(l.code),
                    })}
                    className={`px-2.5 py-1 rounded-ui text-[14px] border transition-colors ${
                      draft.selectedLanguage === l.code
                        ? 'border-ink text-ink'
                        : 'border-rule text-ink-2 hover:border-rule-strong'
                    } ${usesDevanagari(l.code) ? 'font-deva' : ''}`}
                  >
                    {l.native}
                  </button>
                ))}
              </div>
              <select
                value={draft.selectedVoice}
                onChange={e => setDraft({ ...draft, selectedVoice: e.target.value })}
                className="w-full border border-rule rounded-ui px-3 h-9 text-[14px] bg-white cursor-pointer focus:outline-none focus:border-ink"
              >
                {voices.map(v => (
                  <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>
                ))}
              </select>
            </div>

            <div className="border-t border-rule mt-6 pt-5">
              <button
                onClick={() => activeId && remove(activeId, draft.name)}
                className="text-[13px] text-ink-3 hover:text-signal transition-colors"
              >
                Delete this script
              </button>
            </div>
          </aside>
        </div>
      )}

      <VoiceSandbox open={testing} onClose={() => setTesting(false)} />
    </div>
  );
};

export default ScriptsPage;
