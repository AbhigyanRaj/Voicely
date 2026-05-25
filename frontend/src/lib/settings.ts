import { getApiBaseUrl } from './api';
import { getStoredToken } from './auth';

export interface ProviderCredential {
  _id: string;
  providerName: string;
  isDefault: boolean;
  credentials: {
    accountSid: string;
    phoneNumber: string;
    authToken: string;
  };
}

export const getProviders = async (): Promise<ProviderCredential[]> => {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${getApiBaseUrl()}/settings/providers`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    throw new Error('Failed to fetch providers');
  }

  const data = await res.json();
  return data.providers || [];
};

export const saveProvider = async (
  providerName: string,
  accountSid: string,
  authToken: string,
  phoneNumber: string
): Promise<void> => {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');

  const res = await fetch(`${getApiBaseUrl()}/settings/providers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      providerName,
      accountSid,
      authToken,
      phoneNumber
    })
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to save provider');
  }
};
