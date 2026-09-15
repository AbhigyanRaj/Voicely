import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeveloperPage from '../DeveloperPage';

const getPipelineOptions = vi.fn();
const getDeveloperKeys = vi.fn();

vi.mock('../../lib/developer', () => ({
  getPipelineOptions: () => getPipelineOptions(),
  getDeveloperKeys: () => getDeveloperKeys(),
  generateDeveloperKey: vi.fn(),
  deleteDeveloperKey: vi.fn(),
}));

const OPTIONS = {
  llm: [
    { id: 'qwen/qwen3.8-27b', name: 'Qwen3.8 27B', provider: 'Groq', note: 'What Voicely itself runs' },
    { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'OpenAI' },
  ],
  stt: { model: 'nova-3', provider: 'Deepgram', fixed: true as const },
  tts: { model: 'sonic-3.5', provider: 'Cartesia', fixed: true as const },
};

const renderPage = () => {
  // retry:false, or an erroring query spends its backoff before settling.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BrowserRouter><DeveloperPage /></BrowserRouter>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  getPipelineOptions.mockReset();
  getDeveloperKeys.mockReset();
});

describe('DeveloperPage', () => {
  it('offers the models that are really selectable, and states the ones that are not', async () => {
    getPipelineOptions.mockResolvedValue(OPTIONS);
    getDeveloperKeys.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole('button', { name: /Qwen3\.8 27B/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /Developer keys/i })).toBeInTheDocument();
    // STT and TTS are hardcoded in developerStreamServer, so they are stated.
    expect(screen.getByText(/Deepgram nova-3/)).toBeInTheDocument();
    expect(screen.getByText(/Cartesia sonic-3\.5/)).toBeInTheDocument();
  });

  it('shows no invented latency or accuracy figures', async () => {
    getPipelineOptions.mockResolvedValue(OPTIONS);
    getDeveloperKeys.mockResolvedValue([]);
    renderPage();
    await screen.findByRole('button', { name: /Qwen3\.8 27B/ });

    expect(screen.queryByText(/Estimated Latency/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Average Accuracy/i)).not.toBeInTheDocument();
  });

  it('reports a failed load instead of spinning forever', async () => {
    // The old page gated on `!options`, and react-query leaves data undefined
    // on error while isLoading goes false -- so any failure rendered the
    // loading spinner permanently, with nothing said about why.
    getPipelineOptions.mockRejectedValue(new Error('Could not load the pipeline options'));
    getDeveloperKeys.mockRejectedValue(new Error('Could not load your keys'));
    renderPage();

    expect(await screen.findByText(/Couldn’t load your keys/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/Loading environment/i)).not.toBeInTheDocument();
  });
});
