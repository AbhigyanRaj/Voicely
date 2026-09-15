import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { updateProfileName, setStoredUser } from '../lib/auth';

/**
 * Settings.
 *
 * The previous version was theatre. It offered Billing and Notifications as
 * `cursor-not-allowed` buttons with no handler, a disabled email field, and a
 * "Save Changes" button with no onClick -- a form that could not be filled in,
 * above a button that saved nothing. It also sat on zinc-950 while the rest of
 * the desk is paper, so the two halves of the screen looked like two products.
 *
 * What is left is what is true: the one field the server will actually change
 * (`PUT /auth/profile` takes `name` and nothing else), the facts about the
 * account it will not, and the places worth going next. Sections that do not
 * exist are not drawn as disabled tabs -- an empty promise costs more than a
 * missing one.
 */

/** A labelled fact the user cannot edit. Stated, with the reason. */
const Fact: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <div className="py-4 border-b border-rule">
    <div className="text-[13px] text-ink-3 mb-1">{label}</div>
    <div className="text-[15px] text-ink">{value}</div>
    {note && <p className="text-[13px] text-ink-3 mt-1 leading-relaxed">{note}</p>}
  </div>
);

export const SettingsPage: React.FC = () => {
  const { user, setUser, signOut } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string | null>(null);

  const dirty = name.trim() !== (user?.name || '').trim() && name.trim().length > 0;

  const save = async () => {
    if (!dirty) return;
    setState('saving');
    setError(null);
    try {
      const updated = await updateProfileName(name.trim());
      // Both, or the sidebar keeps the old name until the next reload.
      setUser(updated);
      setStoredUser(updated);
      setState('saved');
      setTimeout(() => setState('idle'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your name');
      setState('idle');
    }
  };

  return (
    <div className="min-h-full bg-paper">
      <header className="px-6 lg:px-9 pt-7 pb-4 border-b border-rule">
        <h1 className="font-display text-[27px] font-semibold tracking-tight">Settings</h1>
      </header>

      <div className="px-6 lg:px-9 py-7 max-w-[62ch]">

        <section className="mb-9">
          <h2 className="font-display text-[18px] font-semibold mb-4">Your account</h2>

          <div className="py-4 border-b border-rule">
            <label htmlFor="display-name" className="text-[13px] text-ink-3 mb-1.5 block">
              Name
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                id="display-name"
                value={name}
                onChange={e => { setName(e.target.value); setState('idle'); }}
                onKeyDown={e => { if (e.key === 'Enter') save(); }}
                className="flex-1 min-w-[200px] border border-rule rounded-ui px-3.5 h-10 text-[15px] bg-white focus:outline-none focus:border-ink transition-colors"
              />
              <button
                onClick={save}
                disabled={!dirty || state === 'saving'}
                className="bg-signal text-paper text-[14px] font-semibold px-5 h-10 rounded-ui hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity shrink-0"
              >
                {state === 'saving' ? 'Saving…' : 'Save'}
              </button>
            </div>
            {error && <p className="text-[13px] text-signal mt-2">{error}</p>}
            {state === 'saved' && !error && (
              <p className="text-[13px] text-settled mt-2">Saved.</p>
            )}
            {!error && state !== 'saved' && (
              <p className="text-[13px] text-ink-3 mt-2 leading-relaxed">
                What the agent calls you, and what shows in the sidebar.
              </p>
            )}
          </div>

          <Fact
            label="Email"
            value={user?.email || 'Not set'}
            note="Can’t be changed here yet. Write in if you need it moved."
          />

          <Fact
            label="Plan"
            value={user?.subscription?.tier
              ? user.subscription.tier[0].toUpperCase() + user.subscription.tier.slice(1)
              : 'Free'}
            note="There is no billing yet, so nothing is charged and nothing is metered."
          />

          {typeof user?.totalCallsMade === 'number' && (
            <Fact label="Calls made" value={new Intl.NumberFormat('en-IN').format(user.totalCallsMade)} />
          )}
        </section>

        <section className="mb-9">
          <h2 className="font-display text-[18px] font-semibold mb-1">Keys and the API</h2>
          <p className="text-[14px] text-ink-2 leading-relaxed mb-3">
            Bring your own Deepgram, Groq or Cartesia keys, and read the streaming API.
          </p>
          <Link to="/developer" className="text-[14px] text-signal hover:underline">
            Open developer settings →
          </Link>
        </section>

        <section className="border-t border-rule pt-6">
          <button
            onClick={() => { signOut().catch(e => console.error('Sign out error:', e)); }}
            className="border border-rule text-[14px] px-4 h-9 rounded-ui hover:border-rule-strong transition-colors"
          >
            Sign out
          </button>
        </section>
      </div>
    </div>
  );
};

export default SettingsPage;
