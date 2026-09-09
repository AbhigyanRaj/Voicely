import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ModulesPage from '../ModulesPage';

// Mock the Auth context to provide a user
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'test-user-id', name: 'Test User' } }),
  AuthProvider: ({ children }: any) => <div>{children}</div>,
}));

// Mock the API calls
vi.mock('../../lib/auth', () => ({
  getUserModules: vi.fn().mockResolvedValue([
    {
      id: 'mod-1',
      name: 'Test Agent',
      questions: [{ question: 'How can I help you?', order: 0, required: true }],
      createdAt: Date.now(),
    }
  ]),
  deleteVoiceModule: vi.fn().mockResolvedValue(true),
  updateVoiceModule: vi.fn().mockResolvedValue(true),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('ModulesPage', () => {
  it('renders the ModulesPage header correctly', () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ModulesPage />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/Voice Agents/i)).toBeInTheDocument();
  });

  it('loads and displays agents', async () => {
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ModulesPage />
        </QueryClientProvider>
      </MemoryRouter>
    );

    // It should eventually show the mocked agent
    const agentName = await screen.findByText(/Test Agent/i);
    expect(agentName).toBeInTheDocument();
  });
});
