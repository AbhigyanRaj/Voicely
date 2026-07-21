import React from 'react';

export const StatsMarquee: React.FC = () => {
  return (
    <section className="py-12 w-full border-t border-white/[0.02]">
      <div className="w-full max-w-7xl mx-auto overflow-hidden relative px-4">
        <div className="text-center mb-8">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-600">
            Trusted by innovative teams worldwide
          </span>
        </div>
        
        <div className="absolute inset-y-0 left-0 w-16 md:w-48 bg-gradient-to-r from-zinc-950 to-transparent z-10 mt-8 pointer-events-none"></div>
        <div className="absolute inset-y-0 right-0 w-16 md:w-48 bg-gradient-to-l from-zinc-950 to-transparent z-10 mt-8 pointer-events-none"></div>
        
        <div className="flex w-[200%] animate-marquee py-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex-1 flex justify-around items-center">
              <span className="text-sm font-bold text-zinc-600 hover:text-zinc-500 transition-colors cursor-default whitespace-nowrap px-8">AWS Startups</span>
              <span className="text-sm font-bold text-zinc-600 hover:text-zinc-500 transition-colors cursor-default whitespace-nowrap px-8">Y Combinator</span>
              <span className="text-sm font-bold text-zinc-600 hover:text-zinc-500 transition-colors cursor-default whitespace-nowrap px-8">OpenAI</span>
              <span className="text-sm font-bold text-zinc-600 hover:text-zinc-500 transition-colors cursor-default whitespace-nowrap px-8">TechStars</span>
              <span className="text-sm font-bold text-zinc-600 hover:text-zinc-500 transition-colors cursor-default whitespace-nowrap px-8">A16z</span>
              <span className="text-sm font-bold text-zinc-600 hover:text-zinc-500 transition-colors cursor-default whitespace-nowrap px-8">Google Cloud</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
