import React from 'react';

const STEPS = [
  {
    step: '01',
    title: 'Raw Audio In',
    description: 'Browser microphone or telephony stream sends 16kHz PCM audio over WebSocket.',
    tag: 'Input',
  },
  {
    step: '02',
    title: 'Speech-to-Text',
    description: 'Deepgram nova-2 transcribes in real-time with sub-300ms first-word latency.',
    tag: 'STT · Deepgram',
  },
  {
    step: '03',
    title: 'LLM Reasoning',
    description: 'Groq runs your system prompt + conversation history, streaming tokens as they arrive.',
    tag: 'LLM · Groq',
  },
  {
    step: '04',
    title: 'Voice Synthesis',
    description: 'Cartesia converts streamed text chunks to audio on sentence boundaries — not at the end.',
    tag: 'TTS · Cartesia',
  },
  {
    step: '05',
    title: 'Audio Out',
    description: 'Compressed μ-Law audio streams back to the caller with barge-in interrupt support.',
    tag: 'Output',
  },
];

export const ArchitectureSection: React.FC = () => {
  return (
    <section className="relative w-full">
      <div className="py-28 px-4 w-full max-w-4xl mx-auto border-t border-white/[0.04]">

        {/* Header */}
        <div className="mb-16">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-600 mb-4">Pipeline</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white">
            How it works.
          </h2>
          <p className="text-zinc-500 text-sm mt-3 max-w-md leading-relaxed">
            Every voice call runs through a deterministic 5-stage pipeline. No magic, no black boxes.
          </p>
        </div>

        {/* Steps */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[22px] top-0 bottom-0 w-px bg-white/[0.05] hidden md:block" />

          <div className="space-y-0">
            {STEPS.map((s, i) => (
              <div
                key={s.step}
                className="relative flex gap-8 group"
              >
                {/* Step number + dot */}
                <div className="flex-shrink-0 hidden md:flex flex-col items-center">
                  <div className="w-11 h-11 rounded-full bg-[#0c0c0c] border border-white/[0.08] flex items-center justify-center relative z-10 group-hover:border-white/[0.16] transition-colors">
                    <span className="text-[10px] font-bold text-zinc-500 group-hover:text-zinc-300 transition-colors">{s.step}</span>
                  </div>
                </div>

                {/* Content */}
                <div className={`flex-1 pb-10 ${i === STEPS.length - 1 ? 'pb-0' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600 bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 rounded-full">
                          {s.tag}
                        </span>
                      </div>
                      <h3 className="text-[15px] font-semibold text-white mb-1.5">{s.title}</h3>
                      <p className="text-sm text-zinc-500 leading-relaxed max-w-lg">{s.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Latency callout */}
        <div className="mt-14 border border-white/[0.06] rounded-xl bg-white/[0.02] px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-white text-sm font-semibold">End-to-end latency</p>
            <p className="text-zinc-500 text-xs mt-0.5">Median time from speech-end to first audio byte returned.</p>
          </div>
          <div className="flex items-baseline gap-1 flex-shrink-0">
            <span className="text-3xl font-bold text-white tabular-nums">&lt;800</span>
            <span className="text-zinc-500 text-sm font-medium">ms</span>
          </div>
        </div>

      </div>
    </section>
  );
};
