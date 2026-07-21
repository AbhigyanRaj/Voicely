import React from 'react';
import { Code, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export const CodeSection: React.FC = () => {
  return (
    <section className="relative w-full overflow-hidden">
      <div className="absolute top-1/2 right-0 w-[500px] h-[500px] bg-white/[0.03] rounded-full blur-[120px] pointer-events-none"></div>
      <div className="py-32 px-4 w-full max-w-5xl mx-auto border-t border-white/5 relative z-10">
        <div className="flex flex-col lg:flex-row gap-16 items-center">
        <div className="flex-1 text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.05] mb-6">
            <Code className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[9px] font-bold tracking-[0.2em] text-zinc-400 uppercase">Developer API</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-6 tracking-tight">Integrate in <span className="text-zinc-500">seconds.</span></h2>
          <p className="text-zinc-500 leading-relaxed text-sm max-w-md mb-8">
            Connect to our agnostic Speech-to-Speech WebSocket from Node.js, Python, or directly in the browser. Swap out underlying AI models instantly without changing your codebase.
          </p>
          <Link to="/developer/docs" className="inline-flex items-center gap-2 text-sm font-bold text-white hover:text-zinc-300 transition-colors group">
            Read the Documentation <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
        
        <div className="flex-1 w-full max-w-lg">
           <div className="border border-white/[0.05] rounded-2xl overflow-hidden bg-[#050505] shadow-2xl">
              <div className="bg-white/[0.02] border-b border-white/[0.02] px-4 py-3 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-800"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-800"></div>
                  <div className="w-2.5 h-2.5 rounded-full bg-zinc-800"></div>
                </div>
                <span className="text-[10px] text-zinc-600 font-mono ml-2">client.js</span>
              </div>
              <pre className="p-6 text-xs font-mono overflow-x-auto leading-relaxed custom-scrollbar">
<div><span className="text-zinc-500">const</span> <span className="text-zinc-300">ws</span> <span className="text-zinc-500">= new</span> <span className="text-zinc-300">WebSocket</span><span className="text-zinc-500">(</span></div>
<div>  <span className="text-zinc-400">'wss://app.voicely.com/api/v1/stream?token=vk_dev_...'</span></div>
<div><span className="text-zinc-500">);</span></div>
<br/>
<div><span className="text-zinc-300">ws</span><span className="text-zinc-500">.</span><span className="text-zinc-300">on</span><span className="text-zinc-500">(</span><span className="text-zinc-400">'open'</span><span className="text-zinc-500">, () =&gt; {"{"}</span></div>
<div>  <span className="text-zinc-600">{"//"} 1. Send your microphone stream</span></div>
<div>  <span className="text-zinc-300">ws</span><span className="text-zinc-500">.</span><span className="text-zinc-300">send</span><span className="text-zinc-500">(</span><span className="text-zinc-300">rawAudioBuffer</span><span className="text-zinc-500">);</span></div>
<div><span className="text-zinc-500">{"});"}</span></div>
<br/>
<div><span className="text-zinc-300">ws</span><span className="text-zinc-500">.</span><span className="text-zinc-300">on</span><span className="text-zinc-500">(</span><span className="text-zinc-400">'message'</span><span className="text-zinc-500">, (</span><span className="text-zinc-300">aiResponseBuffer</span><span className="text-zinc-500">) =&gt; {"{"}</span></div>
<div>  <span className="text-zinc-600">{"//"} 2. Play the ultra-low latency response</span></div>
<div>  <span className="text-zinc-300">speaker</span><span className="text-zinc-500">.</span><span className="text-zinc-300">play</span><span className="text-zinc-500">(</span><span className="text-zinc-300">aiResponseBuffer</span><span className="text-zinc-500">);</span></div>
<div><span className="text-zinc-500">{"});"}</span></div>
              </pre>
           </div>
        </div>
      </div>
    </div>
    </section>
  );
};
