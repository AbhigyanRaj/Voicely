import React from 'react';
import { Globe, CheckCircle2, Server, Shield, Zap, BarChart3 } from 'lucide-react';

export const BentoGrid: React.FC = () => {
  return (
    <section className="relative w-full overflow-hidden">
      <div className="absolute top-1/2 left-0 w-[600px] h-[600px] bg-white/[0.03] rounded-full blur-[120px] pointer-events-none -translate-x-1/2"></div>
      <div className="py-32 px-4 w-full max-w-5xl mx-auto border-t border-white/[0.02] relative z-10">
        <div className="text-center mb-16">
        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">Platform <span className="text-zinc-500">features.</span></h2>
        <p className="text-zinc-500 max-w-xl mx-auto text-sm">Everything you need to deploy production-ready voice agents at scale.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* Bento Card 1 */}
        <div className="bg-[#09090b] border border-white/[0.05] p-8 rounded-2xl md:col-span-2 flex flex-col justify-between min-h-[280px] relative overflow-hidden group hover:border-white/[0.1] transition-colors">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] rounded-full blur-[100px] pointer-events-none group-hover:bg-white/[0.04] transition-colors"></div>
          
          {/* Micro UI: Dropdown selector */}
          <div className="self-end mb-8 w-48 bg-[#09090b] border border-white/[0.05] rounded-lg p-1.5 shadow-2xl transform group-hover:-translate-y-1 transition-transform">
            <div className="flex items-center justify-between p-2 bg-white/[0.03] rounded-md cursor-default border border-white/[0.02]">
              <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-zinc-400"/> <span className="text-xs text-zinc-200 font-medium">Groq Llama 3</span></div>
              <CheckCircle2 className="w-3.5 h-3.5 text-white"/>
            </div>
            <div className="flex items-center justify-between p-2 hover:bg-white/[0.02] rounded-md cursor-default opacity-40">
              <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-zinc-500"/> <span className="text-xs text-zinc-400 font-medium">GPT-4o</span></div>
            </div>
            <div className="flex items-center justify-between p-2 hover:bg-white/[0.02] rounded-md cursor-default opacity-40">
              <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-zinc-500"/> <span className="text-xs text-zinc-400 font-medium">Claude 3.5</span></div>
            </div>
          </div>
          
          <div className="relative z-10">
            <Server className="w-5 h-5 text-white mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Agnostic AI Pipeline</h3>
            <p className="text-sm text-zinc-500 max-w-sm leading-relaxed">Swap between OpenAI, Gemini, Llama, Deepgram, and Cartesia on the fly. Don't get locked into a single provider's ecosystem.</p>
          </div>
        </div>
        
        {/* Bento Card 2 */}
        <div className="bg-[#09090b] border border-white/[0.05] p-8 rounded-2xl flex flex-col justify-between min-h-[280px] relative overflow-hidden group hover:border-white/[0.1] transition-colors">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] rounded-full blur-[100px] pointer-events-none group-hover:bg-white/[0.04] transition-colors"></div>
          
          {/* Micro UI: API Key hidden */}
          <div className="self-end mb-8 bg-black border border-white/[0.08] rounded-md px-3 py-2 flex items-center gap-2 font-mono text-[10px] text-zinc-500 shadow-xl group-hover:scale-105 transition-transform">
            sk-<span className="tracking-widest">••••••••••••</span>
          </div>

          <div className="relative z-10">
            <Shield className="w-5 h-5 text-white mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Bring Your Own Key</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">Your API keys are encrypted at rest. You only pay for your own provider usage.</p>
          </div>
        </div>

        {/* Bento Card 3 */}
        <div className="bg-[#09090b] border border-white/[0.05] p-8 rounded-2xl flex flex-col justify-between min-h-[280px] relative overflow-hidden group hover:border-white/[0.1] transition-colors">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] rounded-full blur-[100px] pointer-events-none group-hover:bg-white/[0.04] transition-colors"></div>
          
          {/* Micro UI: Live recording indicator */}
          <div className="self-end mb-8 flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] px-3 py-1.5 rounded-full shadow-lg group-hover:bg-white/[0.06] transition-colors">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
            <span className="text-[9px] font-medium uppercase tracking-widest text-zinc-300">Live Call</span>
          </div>

          <div className="relative z-10">
            <Zap className="w-5 h-5 text-white mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Live Intervention</h3>
            <p className="text-sm text-zinc-500 leading-relaxed">Monitor ongoing calls in real-time and manually intervene if the AI agent gets stuck.</p>
          </div>
        </div>
        
        {/* Bento Card 4 */}
        <div className="bg-[#09090b] border border-white/[0.05] p-8 rounded-2xl md:col-span-2 flex flex-col justify-between min-h-[280px] relative overflow-hidden group hover:border-white/[0.1] transition-colors">
          <div className="absolute top-0 left-0 w-64 h-64 bg-white/[0.02] rounded-full blur-[100px] pointer-events-none group-hover:bg-white/[0.04] transition-colors"></div>
          
          {/* Micro UI: Mini bar chart */}
          <div className="self-end mb-8 flex items-end gap-1.5 h-16 opacity-60 group-hover:opacity-100 transition-opacity">
            {[40, 70, 45, 90, 60, 30, 80].map((h, i) => (
              <div key={i} className="w-2 md:w-3 bg-white/[0.08] rounded-sm group-hover:bg-white/[0.2] transition-colors relative" style={{ height: `${h}%`, transitionDelay: `${i * 50}ms` }}>
                <div className="absolute top-0 left-0 w-full h-0.5 bg-white/40 rounded-t-sm"></div>
              </div>
            ))}
          </div>

          <div className="relative z-10">
            <BarChart3 className="w-5 h-5 text-white mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Deep Journey Analytics</h3>
            <p className="text-sm text-zinc-500 max-w-sm leading-relaxed">High-fidelity timelines, sentiment tracking, and automated recurring callback logic built directly into the dashboard.</p>
          </div>
        </div>
      </div>
    </div>
    </section>
  );
};
