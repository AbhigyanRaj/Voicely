import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import AnalyticsPage from '../AnalyticsPage';
import { AuthProvider } from '../../contexts/AuthContext';
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('AnalyticsPage', () => {
  it('renders loading state initially', () => {
    (api.api.getCallHistory as any).mockImplementation(() => new Promise(() => {}));
    
    render(
      <QueryClientProvider client={queryClient}>
        <AnalyticsPage />
      </QueryClientProvider>
    );
    expect(screen.getByText(/Loading analytics/i)).toBeInTheDocument();
  });

  it('renders error state when API fails', async () => {
    (api.api.getCallHistory as any).mockResolvedValue({ success: false });
    
    render(
      <QueryClientProvider client={queryClient}>
        <AnalyticsPage />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load analytics data/i)).toBeInTheDocument();
    });
  });
});
