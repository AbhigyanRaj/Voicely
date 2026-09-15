import { getApiBaseUrl } from './api';
import { getStoredToken } from './auth';

/**
 * Developer keys.
 *
 * `PipelineModelOption` used to carry `latency` and `accuracy` per model. Those
 * numbers were hardcoded on the server and never measured, and the page summed
 * them into an "Estimated Latency" and averaged them into an "Average Accuracy"
 * that it presented as fact. Both fields are gone; nothing replaces them,
 * because nothing has been measured per model.
 */
export interface LlmOption {
  id: string;
  name: string;
  provider: string;
  note?: string;
}

/** STT and TTS are fixed in developerStreamServer, so they are stated, not chosen. */
export interface FixedStage {
  model: string;
  provider: string;
  fixed: true;
}

export interface PipelineOptions {
  llm: LlmOption[];
  stt: FixedStage;
  tts: FixedStage;
}

export interface DeveloperKey {
  _id: string;
  keyPrefix: string;
  name: string;
  pipelineConfig: {
    sttModel: string;
    llmModel: string;
    ttsModel: string;
  };
  createdAt: string;
  lastUsedAt?: string;
}

const authHeaders = () => {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');
  return { Authorization: `Bearer ${token}` };
};

export const getPipelineOptions = async (): Promise<PipelineOptions> => {
  const res = await fetch(`${getApiBaseUrl()}/developer/options`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Could not load the pipeline options');
  return (await res.json()).options;
};

export const getDeveloperKeys = async (): Promise<DeveloperKey[]> => {
  const res = await fetch(`${getApiBaseUrl()}/developer/keys`, { headers: authHeaders() });
  if (!res.ok) throw new Error('Could not load your keys');
  return (await res.json()).keys;
};

/**
 * The raw key comes back exactly once and is never retrievable again: the
 * server stores only a SHA-256 hash of it.
 */
export const generateDeveloperKey = async (
  name: string,
  llmModel: string,
  providerKeys: Record<string, string>
): Promise<{ key: string; keyRecord: DeveloperKey }> => {
  const res = await fetch(`${getApiBaseUrl()}/developer/keys`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, pipelineConfig: { llmModel }, providerKeys }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Could not create the key');
  }

  const data = await res.json();
  return { key: data.key, keyRecord: data.keyRecord };
};

export const deleteDeveloperKey = async (keyId: string): Promise<void> => {
  const res = await fetch(`${getApiBaseUrl()}/developer/keys/${keyId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Could not revoke the key');
};
