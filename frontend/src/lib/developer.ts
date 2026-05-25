import { getApiBaseUrl } from './api';
import { getStoredToken } from './auth';

export interface PipelineModelOption {
  id: string;
  name: string;
  latency: number;
  accuracy: number;
  provider: string;
  description: string;
  isComingSoon?: boolean;
}

export interface PipelineOptions {
  stt: PipelineModelOption[];
  llm: PipelineModelOption[];
  tts: PipelineModelOption[];
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

export const getPipelineOptions = async (): Promise<PipelineOptions> => {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${getApiBaseUrl()}/developer/options`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch options');
  const data = await res.json();
  return data.options;
};

export const getDeveloperKeys = async (): Promise<DeveloperKey[]> => {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${getApiBaseUrl()}/developer/keys`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch keys');
  const data = await res.json();
  return data.keys;
};

export const generateDeveloperKey = async (
  name: string,
  sttModel: string,
  llmModel: string,
  ttsModel: string,
  providerKeys: Record<string, string>
): Promise<{ key: string; keyRecord: DeveloperKey, actualLatency?: number }> => {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${getApiBaseUrl()}/developer/keys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name,
      pipelineConfig: { sttModel, llmModel, ttsModel },
      providerKeys
    })
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to generate key');
  }

  const data = await res.json();
  return { key: data.key, keyRecord: data.keyRecord, actualLatency: data.actualLatency };
};

export const deleteDeveloperKey = async (keyId: string): Promise<void> => {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${getApiBaseUrl()}/developer/keys/${keyId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) throw new Error('Failed to delete key');
};
