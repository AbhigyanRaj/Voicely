import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import SettingsPage from '../SettingsPage';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'test-user', name: 'Test User' }, signOut: vi.fn() }),
}));

vi.mock('../../lib/auth', () => ({
  getStoredToken: () => 'fake-token',
}));

vi.mock('../../lib/api', () => ({
  api: {
    getWorkspaces: vi.fn().mockResolvedValue({ success: true, workspaces: [] }),
  },
}));

vi.mock('../../lib/settings', () => ({
  getProviders: vi.fn().mockResolvedValue([]),
  saveProvider: vi.fn().mockResolvedValue({ success: true }),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('SettingsPage', () => {
  it('renders the SettingsPage correctly', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsPage />
      </QueryClientProvider>
    );

    expect(screen.getByText(/Settings/i)).toBeInTheDocument();
    expect(screen.getByText(/Manage your account/i)).toBeInTheDocument();
  });
});
