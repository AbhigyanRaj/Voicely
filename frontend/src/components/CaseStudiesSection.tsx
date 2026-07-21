import React from 'react';
import { Button } from '@/components/ui/button';

export const CaseStudiesSection: React.FC = () => {
  return (
    <section className="bg-white py-24 md:py-32 px-6 lg:px-20 relative z-10">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-20 gap-8">
          <div className="max-w-2xl">
            <span className="text-blue-600 font-bold text-sm tracking-wide uppercase mb-4 block">Your Potential Impact</span>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-normal text-zinc-900 tracking-tight leading-tight">
              The impact we can<br/>make for you
            </h2>
          </div>
          <div className="max-w-md flex flex-col items-start md:items-end gap-6">
            <Button variant="default" className="bg-[#0A1128] hover:bg-[#0A1128]/90 text-white rounded-full px-6 py-5">
              Start Your Pilot
            </Button>
            <p className="text-zinc-600 text-lg md:text-right">
              Discover how Voicely's AI voice agents can streamline your operations, enhance your customer service, and help you scale effortlessly.
            </p>
          </div>
        </div>

        {/* Stacked Cards Container */}
        <div className="flex flex-col gap-6 md:gap-10 pb-24 max-w-5xl mx-auto">
          
          {/* Card 1 */}
          <div className="sticky top-24 w-full rounded-2xl bg-[#F8F9FA] p-8 md:p-14 flex flex-col justify-start items-start text-left border border-black/5 shadow-sm z-10">
            <span className="text-4xl font-serif text-zinc-900 leading-none mb-4">“</span>
            <h3 className="text-xl md:text-4xl lg:text-[2.75rem] leading-[1.15] tracking-tight text-zinc-900 font-serif max-w-4xl">
              Increase your scheduling NPS by 38% and fill underutilized capacity, allowing your team to focus on meaningful care instead of phone tag.
            </h3>
          </div>

          {/* Card 2 */}
          <div className="sticky top-32 w-full rounded-2xl bg-[#0A1128] p-8 md:p-14 flex flex-col justify-start items-start text-left border border-white/10 shadow-xl z-20">
            <span className="text-4xl font-serif text-white leading-none mb-4">“</span>
            <h3 className="text-3xl md:text-4xl lg:text-[2.75rem] leading-[1.15] tracking-tight text-white font-serif font-normal max-w-4xl">
              Answer calls in seconds, handle urgent support at scale, and boost your NPS by 70% with an AI that acts exactly like a human agent.
            </h3>
          </div>

          {/* Card 3 */}
          <div className="sticky top-40 w-full rounded-2xl bg-blue-600 p-8 md:p-14 flex flex-col justify-start items-start text-left border border-white/10 shadow-2xl z-30">
            <span className="text-4xl font-serif text-white leading-none mb-4">“</span>
            <h3 className="text-3xl md:text-4xl lg:text-[2.75rem] leading-[1.15] tracking-tight text-white font-serif font-normal max-w-4xl">
              Handle 100% of inbound calls with only a 30% transfer rate, scale effortlessly, and collect missed revenue without sacrificing trust.
            </h3>
          </div>

        </div>
      </div>
    </section>
  );
};
