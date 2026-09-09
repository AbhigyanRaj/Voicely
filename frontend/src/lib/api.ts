// Helper to get API base URL dynamically
export const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  if (process.env.NODE_ENV === 'production') {
    return 'https://voicely-api-qj5r.onrender.com/api/v1';
  }
  
  // In development, handle ngrok or localhost
  // If we're accessed via an ngrok URL (non-localhost), use that as the base
  if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
    return `${window.location.protocol}//${window.location.host}/api/v1`;
  }
  
  return 'http://localhost:5001/api/v1';
};

// Helper to get WS base URL dynamically
export const getWsBaseUrl = () => {
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  
  const isProd = process.env.NODE_ENV === 'production';
  const apiHost = isProd ? 'voicely-api-qj5r.onrender.com' : 'localhost:5001';
  
  // If we're accessed via an ngrok URL (non-localhost), use that host for WS too
  if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }

  const protocol = isProd || (typeof window !== 'undefined' && window.location.protocol === 'https:') ? 'wss:' : 'ws:';
  return `${protocol}//${apiHost}`;
};


// Centralized API Fetch Wrapper with Error Handling
export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = getStoredToken();
  const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    // Token expired – auto sign out
    removeStoredToken();
    window.location.href = '/';
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }

  return res.json();
};

// API service for backend communication.
//
// The `token` parameters these methods used to take were never read -- apiFetch
// reads it from storage itself. Dropped along with initiateCall (telephony),
// getCallCostInfo (no such endpoint; it resolved to /calls/:id and 500'd),
// healthCheck, getUserAnalytics and the workspace helpers, none of which had a
// single call site.
export const api = {
  async getCallDetails(callId: string) {
    return apiFetch(`/calls/${callId}`, { method: 'GET' });
  },

  /** Session history. Pass a large limit for analytics: the default is 10. */
  async getCallHistory(page = 1, limit = 200, status?: string, moduleId?: string) {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.append('status', status);
    if (moduleId) params.append('moduleId', moduleId);
    return apiFetch(`/calls/history?${params}`, { method: 'GET' });
  },
};

// Token management (keeping for future use)
export const getStoredToken = (): string | null => {
  return localStorage.getItem('vokai_jwt_token');
};

export const setStoredToken = (token: string) => {
  localStorage.setItem('vokai_jwt_token', token);
};

export const removeStoredToken = () => {
  localStorage.removeItem('vokai_jwt_token');
};