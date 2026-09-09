import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import AnalyticsPage from '../AnalyticsPage';
import * as api from '../../lib/api';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'test-user', name: 'Test User' } }),
  AuthProvider: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../../lib/auth', () => ({
  getStoredToken: () => 'fake-token',
}));

vi.mock('../../lib/api', () => ({
  api: {
    getCallHistory: vi.fn(),
  },
}));

const newClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('AnalyticsPage', () => {
  it('renders loading state initially', () => {
    (api.api.getCallHistory as any).mockImplementation(() => new Promise(() => {}));
    
    render(
      <QueryClientProvider client={newClient()}>
        <AnalyticsPage />
      </QueryClientProvider>
    );
    // The loading state is a skeleton, not text.
    expect(document.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length).toBeGreaterThan(0);
  });

  it('renders error state when API fails', async () => {
    (api.api.getCallHistory as any).mockResolvedValue({ success: false });
    
    render(
      <QueryClientProvider client={newClient()}>
        <AnalyticsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      // The component throws "Failed to fetch analytics data" and renders that
      // message verbatim; the old assertion looked for "load".
      expect(screen.getByText(/Failed to fetch analytics data/i)).toBeInTheDocument();
    });
  });
});
