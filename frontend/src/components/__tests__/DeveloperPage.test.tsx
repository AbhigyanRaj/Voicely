import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import DeveloperPage from '../DeveloperPage';
import { BrowserRouter } from 'react-router-dom';

vi.mock('../../hooks/useDeveloperS2S', () => ({
  useDeveloperS2S: () => ({ isTesting: false, startTesting: vi.fn(), stopTesting: vi.fn() })
}));

vi.mock('../../lib/developer', () => ({
  getPipelineOptions: vi.fn().mockResolvedValue({
    stt: [{ id: 'stt-1', name: 'STT 1', provider: 'test', latency: 10, accuracy: 99 }],
    llm: [{ id: 'llm-1', name: 'LLM 1', provider: 'test', latency: 10, accuracy: 99 }],
    tts: [{ id: 'tts-1', name: 'TTS 1', provider: 'test', latency: 10, accuracy: 99 }]
  }),
  getDeveloperKeys: vi.fn().mockResolvedValue([]),
}));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

describe('DeveloperPage', () => {
  it('renders the DeveloperPage successfully', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <DeveloperPage />
        </BrowserRouter>
      </QueryClientProvider>
    );

    // Initial loading state might be shown very briefly, then the mocked data
    expect(await screen.findByText(/API Configuration/i)).toBeInTheDocument();
  });
});
