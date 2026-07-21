import React from 'react';
import { X, Check } from 'lucide-react';

export const ComparisonSection: React.FC = () => {
  return (
    <section className="w-full bg-white py-24 lg:py-32 border-b border-zinc-100">
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 lg:px-16">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-16 lg:mb-20 gap-8">
          <div>
            <span className="text-blue-600 font-bold text-sm tracking-wide uppercase mb-6 block">Overview</span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-normal text-zinc-900 tracking-tight">
              What is Voicely?
            </h2>
          </div>
          <div className="lg:max-w-[360px]">
            <p className="text-zinc-600 text-lg leading-relaxed">
              LLM based, humanlike, voice-first conversational AI platform
            </p>
          </div>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Card 1 */}
          <div className="bg-[#F8F9FA] rounded-md p-8 md:p-10 flex flex-col justify-between min-h-[480px]">
            <div>
              <div className="flex items-center gap-3 mb-16">
                <span className="text-[13px] font-bold text-zinc-900">Other Solution</span>
                <span className="bg-zinc-200 text-zinc-500 text-xs font-bold px-2 py-1 rounded">Gen 1</span>
              </div>
              <h3 className="text-[26px] font-normal text-zinc-900 mb-4 tracking-tight">IVR Voice Agent</h3>
            </div>
            <p className="text-zinc-700 text-[15px] leading-relaxed font-medium">
              Primarily Used For Call Routing Through Pre-Defined, Touch-Tone Menu Options
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-[#F8F9FA] rounded-md p-8 md:p-10 flex flex-col justify-between min-h-[480px]">
            <div>
              <div className="flex items-center gap-3 mb-16">
                <span className="text-[13px] font-bold text-zinc-900">Other Solution</span>
                <span className="bg-zinc-200 text-zinc-500 text-xs font-bold px-2 py-1 rounded">Gen 2</span>
              </div>
              <h3 className="text-[26px] font-normal text-zinc-900 mb-2 tracking-tight">IVA Voice Agent</h3>
              <p className="text-zinc-600 text-[15px] mb-10">Powered by NLP and Intent Mapping</p>
              
              <ul className="space-y-5">
                <li className="flex items-start gap-3">
                  <X className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5 stroke-[3]" />
                  <span className="text-zinc-600 text-[14px] leading-snug font-medium">Non-natural conversations (limited interaction)</span>
                </li>
                <li className="flex items-start gap-3">
                  <X className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5 stroke-[3]" />
                  <span className="text-zinc-600 text-[14px] leading-snug font-medium">Slow setup with complex configuration</span>
                </li>
                <li className="flex items-start gap-3">
                  <X className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5 stroke-[3]" />
                  <span className="text-zinc-600 text-[14px] leading-snug font-medium">Can't handle edge cases and unexpected inputs</span>
                </li>
                <li className="flex items-start gap-3">
                  <X className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5 stroke-[3]" />
                  <span className="text-zinc-600 text-[14px] leading-snug font-medium">Limited support for simple, one-turn interactions and inbound use cases</span>
                </li>
              </ul>
            </div>
          </div>

            {/* Card 3 */}
            <div className="bg-[#0A101D] rounded-md p-8 md:p-10 flex flex-col justify-between min-h-[480px] text-white">
              <div>
                <div className="flex items-center justify-between mb-16">
                  <div className="flex items-center gap-3">
                    <span className="text-[13px] font-bold text-white">Our Solution</span>
                    <span className="bg-blue-950 text-blue-400 text-xs font-bold px-2 py-1 rounded">Gen 3</span>
                  </div>
                  <a href="https://github.com/abhigyanraj/voicely" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors px-2.5 py-1 rounded-md cursor-pointer group">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-zinc-400 group-hover:text-white transition-colors"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                    <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-400 group-hover:text-white transition-colors">Open Source</span>
                  </a>
                </div>
                <h3 className="text-[26px] font-normal mb-2 tracking-tight">3rd Gen Voice AI</h3>
              <p className="text-zinc-400 text-[15px] mb-10">Powered by LLMs</p>
              
              <ul className="space-y-5">
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-white shrink-0 mt-0.5 stroke-[3]" />
                  <span className="text-zinc-300 text-[14px] leading-snug font-medium">Natural, Human-Like Conversations</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-white shrink-0 mt-0.5 stroke-[3]" />
                  <span className="text-zinc-300 text-[14px] leading-snug font-medium">Fast Setup With Minimal Configuration</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-white shrink-0 mt-0.5 stroke-[3]" />
                  <span className="text-zinc-300 text-[14px] leading-snug font-medium">Handles Edge Cases And Unexpected Inputs</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-white shrink-0 mt-0.5 stroke-[3]" />
                  <span className="text-zinc-300 text-[14px] leading-snug font-medium">Supports Complex, Multi-Turn And Outbound Use Cases</span>
                </li>
              </ul>
            </div>
          </div>
          
        </div>
      </div>
    </section>
  );
};
