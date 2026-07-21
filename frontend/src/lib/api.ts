// Helper to get API base URL dynamically
export const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  if (process.env.NODE_ENV === 'production') {
    return 'https://voicely-api-kbwf.onrender.com/api/v1';
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
  const apiHost = isProd ? 'voicely-api-kbwf.onrender.com' : 'localhost:5001';
  
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

// API service for backend communication
export const api = {
  async initiateCall(token: string, moduleId: string, phoneNumber: string, customerName: string, selectedVoice?: string, selectedLanguage?: string, ttsProvider?: string) {
    return apiFetch('/calls/initiate', {
      method: 'POST',
      body: JSON.stringify({
        moduleId,
        phoneNumber,
        customerName,
        selectedVoice,
        selectedLanguage,
        ttsProvider,
      }),
    });
  },

  async getCallDetails(token: string, callId: string) {
    return apiFetch(`/calls/${callId}`, {
      method: 'GET',
    });
  },

  // Get call cost information - AUTH REQUIRED
  async getCallCostInfo(token: string) {
    return apiFetch('/calls/cost-info', {
      method: 'GET',
    });
  },

  // Health check
  async healthCheck() {
    return apiFetch('/health');
  },

  // Get call history - AUTH REQUIRED
  async getCallHistory(token: string, page = 1, limit = 20, status?: string, moduleId?: string) {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (status) params.append('status', status);
    if (moduleId) params.append('moduleId', moduleId);

    return apiFetch(`/calls/history?${params}`, {
      method: 'GET',
    });
  },

  // Get user analytics - AUTH REQUIRED
  async getUserAnalytics(token: string) {
    return apiFetch('/auth/analytics', {
      method: 'GET',
    });
  },

  // Workspace management - AUTH REQUIRED
  async getWorkspaces(token: string) {
    return apiFetch('/workspaces', {
      method: 'GET',
    });
  },

  async createWorkspace(token: string, name: string, category: string) {
    return apiFetch('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, category }),
    });
  },

  async switchWorkspace(token: string, workspaceId: string) {
    return apiFetch('/workspaces/switch', {
      method: 'POST',
      body: JSON.stringify({ workspaceId }),
    });
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