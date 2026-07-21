import React from 'react';
import { Gauge, Headphones, ArrowRightLeft } from 'lucide-react';

export const HighlightsSection: React.FC = () => {
  return (
    <section className="bg-white py-24 md:py-32 px-6 lg:px-20 border-t border-zinc-100">
      <div className="max-w-7xl mx-auto">
        
        {/* Top Split */}
        <div className="flex flex-col lg:flex-row gap-16 lg:gap-24 mb-24 items-center">
          <div className="flex-1">
            <span className="text-blue-600 font-bold text-sm tracking-wide mb-6 block">Highlights</span>
            <h2 className="text-4xl md:text-5xl lg:text-[4rem] font-normal text-zinc-900 tracking-tight leading-[1.1] mb-8">
              Human-standard AI<br />voice agent, out of the<br />box
            </h2>
            <p className="text-zinc-600 text-lg lg:text-xl max-w-lg leading-relaxed">
              Proprietary Voice AI Orchestration Delivering Human-Quality, Low-Latency Phone Conversations At Scale
            </p>
          </div>
          
          <div className="flex-1 w-full">
            <div className="rounded-xl overflow-hidden aspect-[4/3] relative group">
              <img 
                src="https://images.unsplash.com/photo-1512428559087-560fa5ceab42?q=80&w=1200&auto=format&fit=crop" 
                alt="Man on phone" 
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Film Grain Overlay */}
              <div 
                className="absolute inset-0 opacity-[0.25] mix-blend-overlay pointer-events-none" 
                style={{ 
                  backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` 
                }}
              ></div>
            </div>
          </div>
        </div>

        {/* Features List */}
        <div className="flex flex-col border-t border-zinc-200">
          
          {/* Item 1 */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-12 py-10 md:py-14 border-b border-zinc-200 items-start md:items-center">
            <h3 className="text-2xl md:text-3xl text-zinc-900 flex-1 font-medium tracking-tight">Lowest Latency</h3>
            <p className="text-zinc-600 flex-1 text-lg">
              Independent benchmarks confirm Voicely as the leader in responsiveness. With ~600ms latency, conversations stay smooth and fluent.
            </p>
            <div className="w-20 h-20 rounded-2xl bg-zinc-50 flex items-center justify-center shrink-0 border border-zinc-100">
              <div className="w-8 h-8 rounded-full bg-[#0A1128] flex items-center justify-center relative">
                <Gauge className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>

          {/* Item 2 */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-12 py-10 md:py-14 border-b border-zinc-200 items-start md:items-center">
            <h3 className="text-2xl md:text-3xl text-zinc-900 flex-1 font-medium tracking-tight">Ultra Realistic Voice</h3>
            <p className="text-zinc-600 flex-1 text-lg">
              Built from real performance data and refined through human-guided training to ensure every inflection sounds perfectly natural.
            </p>
            <div className="w-20 h-20 rounded-2xl bg-zinc-50 flex items-center justify-center shrink-0 border border-zinc-100">
              <div className="w-8 h-8 rounded-full bg-[#0A1128] flex items-center justify-center">
                <Headphones className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>

          {/* Item 3 */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-12 py-10 md:py-14 border-b border-zinc-200 items-start md:items-center">
            <h3 className="text-2xl md:text-3xl text-zinc-900 flex-1 font-medium tracking-tight">Turn taking</h3>
            <p className="text-zinc-600 flex-1 text-lg">
              Proprietary turn-taking model that knows exactly when to stop and when to listen, handling interruptions seamlessly like a real human.
            </p>
            <div className="w-20 h-20 rounded-2xl bg-zinc-50 flex items-center justify-center shrink-0 border border-zinc-100">
              <div className="w-8 h-8 rounded-full bg-[#0A1128] flex items-center justify-center">
                <ArrowRightLeft className="w-4 h-4 text-white" />
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};
