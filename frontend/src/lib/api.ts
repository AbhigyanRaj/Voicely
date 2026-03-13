// Helper to get API base URL dynamically
export const getApiBaseUrl = () => {
  if (process.env.NODE_ENV === 'production') {
    return 'https://voicely-api-kbwf.onrender.com/api';
  }
  
  // In development, handle ngrok or localhost
  // If we're accessed via an ngrok URL (non-localhost), use that as the base
  if (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
    return `${window.location.protocol}//${window.location.host}/api`;
  }
  
  return 'http://localhost:5001/api';
};

// Helper to get WS base URL dynamically
export const getWsBaseUrl = () => {
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


// API service for backend communication
export const api = {
  // Call management - AUTH REQUIRED
  async initiateCall(token: string, moduleId: string, phoneNumber: string, customerName: string, selectedVoice?: string, selectedLanguage?: string, ttsProvider?: string) {
    const response = await fetch(`${getApiBaseUrl()}/calls/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        moduleId,
        phoneNumber,
        customerName,
        selectedVoice,
        selectedLanguage,
        ttsProvider,
      }),
    });
    return response.json();
  },

  async getCallDetails(token: string, callId: string) {
    const response = await fetch(`${getApiBaseUrl()}/calls/${callId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return response.json();
  },

  // Get call cost information - AUTH REQUIRED
  async getCallCostInfo(token: string) {
    const response = await fetch(`${getApiBaseUrl()}/calls/cost-info`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  // Health check
  async healthCheck() {
    const response = await fetch(`${getApiBaseUrl()}/health`);
    return response.json();
  },

  // Get call history - AUTH REQUIRED
  async getCallHistory(token: string, page = 1, limit = 20, status?: string, moduleId?: string) {
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
    });
    if (status) params.append('status', status);
    if (moduleId) params.append('moduleId', moduleId);

    const response = await fetch(`${getApiBaseUrl()}/calls/history?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return response.json();
  },

  // Get user analytics - AUTH REQUIRED
  async getUserAnalytics(token: string) {
    const response = await fetch(`${getApiBaseUrl()}/auth/analytics`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return response.json();
  },

  // Workspace management - AUTH REQUIRED
  async getWorkspaces(token: string) {
    const response = await fetch(`${getApiBaseUrl()}/workspaces`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    return response.json();
  },

  async createWorkspace(token: string, name: string, category: string) {
    const response = await fetch(`${getApiBaseUrl()}/workspaces`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, category }),
    });
    return response.json();
  },

  async switchWorkspace(token: string, workspaceId: string) {
    const response = await fetch(`${getApiBaseUrl()}/workspaces/switch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ workspaceId }),
    });
    return response.json();
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