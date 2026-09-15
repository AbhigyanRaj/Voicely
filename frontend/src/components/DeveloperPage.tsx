import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPipelineOptions, getDeveloperKeys, generateDeveloperKey, deleteDeveloperKey,
  type DeveloperKey,
} from '../lib/developer';

/**
 * Developer keys.
 *
 * What this page was: a four-tab "API Configuration" console on zinc-950, with
 * pickers for twenty models and a metrics panel reading "Estimated Latency
 * ~950ms" and "Average Accuracy 93.0%". Both figures were arithmetic over
 * hardcoded constants -- 300+400+250, and (95+90+94)/3 -- and none of the
 * constants had ever been measured. Two tabs said "currently in preview" and
 * did nothing. Most of the models were not ones this product runs, and two had
 * already been decommissioned.
 *
 * What is left is what a key really controls. STT is Deepgram and TTS is
 * Cartesia, both fixed in developerStreamServer, so they are stated rather than
 * offered. The LLM genuinely routes on the model string, so it is a choice.
 *
 * The raw key is shown once. The server keeps only a SHA-256 hash, so there is
 * no second chance to read it and the UI must not pretend otherwise.
 */

const PROVIDER_HINT: Record<string, string> = {
  Groq: 'console.groq.com',
  OpenAI: 'platform.openai.com',
  Google: 'aistudio.google.com',
};

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** The one-time reveal. Deliberately loud: this will not be shown again. */
const NewKey: React.FC<{ value: string; onDone: () => void }> = ({ value, onDone }) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="border border-ink rounded-panel p-5 mb-7 bg-paper-2">
      <div className="font-display text-[17px] font-semibold mb-1">Copy this now</div>
      <p className="text-[13px] text-ink-2 mb-3.5 leading-relaxed">
        Only a hash of this key is stored, so it can’t be shown again. If you lose
        it, revoke it and make another.
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <code className="flex-1 min-w-[260px] text-[13px] bg-white border border-rule rounded-ui px-3 py-2.5 break-all">
          {value}
        </code>
        <button
          onClick={copy}
          className="bg-ink text-paper text-[14px] font-medium px-4 h-10 rounded-ui hover:opacity-90 transition-opacity shrink-0"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={onDone}
          className="border border-rule text-[14px] px-4 h-10 rounded-ui hover:border-rule-strong transition-colors shrink-0"
        >
          Done
        </button>
      </div>
    </div>
  );
};

export const DeveloperPage: React.FC = () => {
  const queryClient = useQueryClient();

  const options = useQuery({ queryKey: ['pipelineOptions'], queryFn: getPipelineOptions });
  const keys = useQuery({ queryKey: ['developerKeys'], queryFn: getDeveloperKeys });

  const [name, setName] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const chosen = options.data?.llm.find(o => o.id === llmModel) ?? options.data?.llm[0];
  const effectiveModel = llmModel || options.data?.llm[0]?.id || '';

  const create = useMutation({
    mutationFn: () => generateDeveloperKey(name.trim() || 'Untitled key', effectiveModel, providerKeys),
    onSuccess: ({ key }) => {
      setFreshKey(key);
      setName('');
      setProviderKeys({});
      queryClient.invalidateQueries({ queryKey: ['developerKeys'] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => deleteDeveloperKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['developerKeys'] }),
  });

  // The providers a key needs: the two fixed stages, plus whoever serves the
  // chosen LLM. Listing all of them regardless would ask for keys that go unused.
  const neededProviders = Array.from(new Set(
    ['Deepgram', chosen?.provider, 'Cartesia'].filter(Boolean) as string[]
  ));

  const loadFailed = options.isError || keys.isError;

  return (
    <div className="min-h-full bg-paper">
      <header className="flex items-baseline gap-4 px-6 lg:px-9 pt-7 pb-4 border-b border-rule flex-wrap">
        <h1 className="font-display text-[27px] font-semibold tracking-tight">Developer keys</h1>
        <Link
          to="/developer/docs"
          className="text-[13px] text-ink-3 hover:text-signal transition-colors ml-auto"
        >
          API documentation →
        </Link>
      </header>

      <div className="px-6 lg:px-9 py-7 max-w-[76ch]">

        {/* A failed query leaves `data` undefined while isLoading is false. The
            old page gated on `!options` and so showed its spinner forever on
            any error, with nothing said about what went wrong. */}
        {loadFailed ? (
          <div>
            <p className="font-display text-[20px] font-semibold mb-2">Couldn’t load your keys</p>
            <p className="text-[14px] text-ink-2 leading-relaxed mb-4 max-w-[46ch]">
              {(options.error as Error)?.message || (keys.error as Error)?.message || 'The server didn’t respond.'}
            </p>
            <button
              onClick={() => { options.refetch(); keys.refetch(); }}
              className="border border-rule text-[14px] px-4 h-9 rounded-ui hover:border-rule-strong transition-colors"
            >
              Try again
            </button>
          </div>
        ) : options.isLoading || keys.isLoading ? (
          <div className="space-y-2.5">
            <div className="h-7 w-48 bg-paper-2 rounded-ui animate-pulse" />
            <div className="h-7 w-72 bg-paper-2 rounded-ui animate-pulse" />
          </div>
        ) : (
          <>
            {freshKey && <NewKey value={freshKey} onDone={() => setFreshKey(null)} />}

            <section className="mb-10">
              <h2 className="font-display text-[18px] font-semibold mb-1">New key</h2>
              <p className="text-[14px] text-ink-2 leading-relaxed mb-5 max-w-[52ch]">
                A key streams speech to speech over <code className="text-[13px]">/api/v1/stream</code> using
                your own provider credentials. They’re encrypted before they’re stored.
              </p>

              <div className="space-y-5">
                <div>
                  <label htmlFor="key-name" className="text-[13px] text-ink-3 mb-1.5 block">
                    What is it for
                  </label>
                  <input
                    id="key-name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Staging, or a teammate’s name"
                    className="w-full max-w-[38ch] border border-rule rounded-ui px-3.5 h-10 text-[15px] bg-white focus:outline-none focus:border-ink transition-colors"
                  />
                </div>

                <div>
                  <div className="text-[13px] text-ink-3 mb-1.5">Model</div>
                  <div className="flex flex-wrap gap-1.5">
                    {options.data!.llm.map(o => (
                      <button
                        key={o.id}
                        onClick={() => setLlmModel(o.id)}
                        className={`px-3 h-8 rounded-ui text-[13px] border transition-colors ${
                          o.id === effectiveModel
                            ? 'border-ink text-ink'
                            : 'border-rule text-ink-2 hover:border-rule-strong'
                        }`}
                      >
                        {o.name}
                        <span className="text-ink-3 ml-1.5">{o.provider}</span>
                      </button>
                    ))}
                  </div>
                  {chosen?.note && (
                    <p className="text-[13px] text-ink-3 mt-2">{chosen.note}</p>
                  )}
                  <p className="text-[13px] text-ink-3 mt-2 leading-relaxed">
                    Speech in is {options.data!.stt.provider} {options.data!.stt.model} and speech out is{' '}
                    {options.data!.tts.provider} {options.data!.tts.model}. Neither is selectable yet.
                  </p>
                </div>

                <div>
                  <div className="text-[13px] text-ink-3 mb-2">Your provider keys</div>
                  <div className="space-y-2.5 max-w-[46ch]">
                    {neededProviders.map(provider => (
                      <div key={provider} className="flex items-center gap-3">
                        <label htmlFor={`pk-${provider}`} className="text-[14px] w-[92px] shrink-0">
                          {provider}
                        </label>
                        <input
                          id={`pk-${provider}`}
                          type="password"
                          autoComplete="off"
                          value={providerKeys[provider] || ''}
                          onChange={e => setProviderKeys(p => ({ ...p, [provider]: e.target.value }))}
                          placeholder={PROVIDER_HINT[provider] || ''}
                          className="flex-1 border border-rule rounded-ui px-3 h-9 text-[14px] bg-white focus:outline-none focus:border-ink transition-colors"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <button
                    onClick={() => create.mutate()}
                    disabled={create.isPending}
                    className="bg-signal text-paper text-[14px] font-semibold px-5 h-10 rounded-ui hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    {create.isPending ? 'Creating…' : 'Create key'}
                  </button>
                  {create.isError && (
                    <p className="text-[13px] text-signal mt-2">{(create.error as Error).message}</p>
                  )}
                </div>
              </div>
            </section>

            <section>
              <h2 className="font-display text-[18px] font-semibold mb-4">
                Your keys
                <span className="text-[14px] text-ink-3 font-normal ml-2 tabular">
                  {keys.data!.length || ''}
                </span>
              </h2>

              {keys.data!.length === 0 ? (
                <p className="text-[14px] text-ink-2">No keys yet.</p>
              ) : (
                <div>
                  {keys.data!.map((k: DeveloperKey) => (
                    <div
                      key={k._id}
                      className="flex items-baseline gap-4 py-3.5 border-b border-rule flex-wrap"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] truncate">{k.name}</div>
                        <div className="text-[13px] text-ink-3 tabular mt-0.5">
                          {k.keyPrefix} · {k.pipelineConfig?.llmModel} · added {shortDate(k.createdAt)}
                          {k.lastUsedAt ? ` · last used ${shortDate(k.lastUsedAt)}` : ' · never used'}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (window.confirm(`Revoke “${k.name}”? Anything using it stops working.`)) {
                            revoke.mutate(k._id);
                          }
                        }}
                        className="text-[13px] text-ink-3 hover:text-signal transition-colors shrink-0"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default DeveloperPage;
