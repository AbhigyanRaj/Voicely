import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import CampaignPage from '../CampaignPage';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'test-user', name: 'Test User' } }),
}));

vi.mock('../../lib/auth', () => ({
  getUserModules: vi.fn().mockResolvedValue([]),
}));

// Mock ContactUploader to avoid complex UI rendering issues in unit tests
vi.mock('../ContactUploader', () => ({
  __esModule: true,
  default: () => <div data-testid="contact-uploader">Contact Uploader</div>
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('CampaignPage', () => {
  it('renders the CampaignPage successfully', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <CampaignPage />
      </QueryClientProvider>
    );

    expect(screen.getByText(/Launch Campaigns/i)).toBeInTheDocument();
    expect(screen.getByTestId('contact-uploader')).toBeInTheDocument();
  });
});
