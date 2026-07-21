import React from 'react';
import { Layers, Code, Server, Shield } from 'lucide-react';

export const DashboardMockup: React.FC = () => {
  return (
    <div className="w-full max-w-4xl mx-auto relative h-64 md:h-[400px] animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-1000 z-10 px-4">
      <div className="absolute inset-x-4 bottom-0 h-full bg-gradient-to-b from-transparent via-zinc-950/90 to-zinc-950 z-20 pointer-events-none"></div>
      <div className="w-full h-full border border-white/[0.08] rounded-t-xl bg-[#09090b] shadow-[0_-20px_50px_-20px_rgba(255,255,255,0.02)] flex flex-col overflow-hidden relative">
        
        {/* Mock Window Header */}
        <div className="h-10 border-b border-white/[0.05] flex items-center justify-between px-4 bg-white/[0.01]">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-zinc-700"></div>
          </div>
          <div className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">Voicely Console</div>
          <div className="w-10"></div> {/* Spacer for center alignment */}
        </div>
        
        {/* Mock Window Body */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Fake Sidebar */}
          <div className="w-12 md:w-48 border-r border-white/[0.05] bg-white/[0.01] hidden sm:flex flex-col gap-2 p-3">
            <div className="flex items-center gap-2 p-2 rounded-md bg-white/[0.05] mb-2">
              <Layers className="w-3.5 h-3.5 text-white" />
              <span className="text-[10px] text-white font-medium tracking-wide hidden md:block">Playground</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-md opacity-40 hover:opacity-100 transition-opacity">
              <Code className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[10px] text-zinc-400 font-medium tracking-wide hidden md:block">API Keys</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-md opacity-40 hover:opacity-100 transition-opacity">
              <Server className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[10px] text-zinc-400 font-medium tracking-wide hidden md:block">Webhooks</span>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-md opacity-40 hover:opacity-100 transition-opacity mt-auto">
              <Shield className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-[10px] text-zinc-400 font-medium tracking-wide hidden md:block">Settings</span>
            </div>
          </div>
          
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col relative bg-black">
            {/* Top Status Bar */}
            <div className="h-8 border-b border-white/[0.05] bg-white/[0.01] flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-zinc-900 border border-white/[0.05] px-2 py-0.5 rounded text-[9px] uppercase tracking-widest font-medium text-zinc-300">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div> Active
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">Agent: v2_sales_assistant</span>
              </div>
              <div className="flex items-center gap-3 text-[9px] text-zinc-500 font-mono uppercase tracking-widest hidden md:flex">
                <span>Latency: 12ms</span>
                <span>Model: Groq Llama3</span>
              </div>
            </div>

            <div className="flex-1 p-4 md:p-6 flex flex-col lg:flex-row gap-6 relative overflow-hidden">
              {/* Live Terminal / Logs */}
              <div className="flex-1 w-full bg-[#09090b] border border-white/[0.05] rounded-md p-4 font-mono text-[10px] md:text-[11px] text-zinc-400 leading-relaxed h-full overflow-hidden flex flex-col justify-end relative shadow-inner">
                <div className="absolute top-0 left-0 w-full h-16 bg-gradient-to-b from-[#09090b] to-transparent z-10 pointer-events-none"></div>
                <div className="flex flex-col gap-2 relative z-0">
                  <div className="flex gap-3"><span className="text-zinc-600 w-16">10:41:00</span><span className="text-blue-400">[SYS]</span><span>WebSocket connection established</span></div>
                  <div className="flex gap-3"><span className="text-zinc-600 w-16">10:41:01</span><span className="text-indigo-400">[AUTH]</span><span>Token validated for org_vck...</span></div>
                  <div className="flex gap-3"><span className="text-zinc-600 w-16">10:41:03</span><span className="text-emerald-400">[STT]</span><span>Deepgram streaming active (16kHz PCM)</span></div>
                  <div className="flex gap-3"><span className="text-zinc-600 w-16">10:41:05</span><span className="text-emerald-400">[STT]</span><span className="text-white">"Hello, I need help upgrading my plan."</span></div>
                  <div className="flex gap-3"><span className="text-zinc-600 w-16">10:41:06</span><span className="text-amber-400">[LLM]</span><span>Generating response via Groq... (142ms)</span></div>
                  <div className="flex gap-3"><span className="text-zinc-600 w-16">10:41:06</span><span className="text-amber-400">[LLM]</span><span className="text-white">"I can certainly help you with that!"</span></div>
                  <div className="flex gap-3"><span className="text-zinc-600 w-16">10:41:06</span><span className="text-rose-400">[TTS]</span><span>Cartesia streaming audio buffer</span></div>
                  <div className="flex gap-3"><span className="text-zinc-600 w-16">10:41:07</span><span className="text-blue-400">[SYS]</span><span className="text-white animate-pulse">Awaiting user input..._</span></div>
                </div>
              </div>
              
              {/* Voice Wave */}
              <div className="w-full lg:w-40 h-32 md:h-full bg-[#09090b] border border-white/[0.05] rounded-md flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-white/[0.02] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/[0.05] to-transparent pointer-events-none"></div>
                <div className="flex items-center justify-center gap-1.5 h-20 opacity-80 z-10">
                  {[20, 45, 80, 40, 95, 60, 85, 30, 70, 100, 60, 40, 85, 50, 30].map((h, i) => (
                    <div key={i} className="w-1 md:w-1.5 bg-zinc-300 rounded-full animate-pulse" style={{ height: `${h}%`, animationDelay: `${i * 0.05}s`, animationDuration: '2s' }}></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};
