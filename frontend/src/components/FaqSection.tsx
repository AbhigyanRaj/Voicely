import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const faqs = [
  {
    question: "What makes Voicely different from traditional IVRs?",
    answer: "Unlike traditional 'press 1 for sales' IVRs, Voicely uses advanced conversational AI to understand natural language, intent, and context. Callers can speak naturally as they would to a human, and our agents handle complex multi-turn conversations without rigid menus."
  },
  {
    question: "How fast does the voice agent respond?",
    answer: "Voicely leads the industry with an ultra-low latency of ~600ms. This near-instantaneous response time eliminates awkward pauses, ensuring conversations feel fluent, natural, and truly human-standard."
  },
  {
    question: "Can Voicely handle being interrupted?",
    answer: "Yes. Our proprietary turn-taking model listens constantly while speaking. If a user interrupts, the agent instantly stops talking, processes the new information, and responds appropriately—exactly like a human would."
  },
  {
    question: "How difficult is it to integrate with our existing systems?",
    answer: "We built Voicely to be developer-first. With our comprehensive API, you can integrate voice agents into your CRM, ticketing system, or custom backend in hours, not weeks. We also offer out-of-the-box integrations for popular platforms."
  },
  {
    question: "Can I customize the agent's voice and personality?",
    answer: "Absolutely. You can choose from dozens of ultra-realistic voices or clone your own. Furthermore, you can define the agent's persona, tone, and knowledge base so it perfectly represents your brand."
  }
];

export const FaqSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="bg-zinc-50 py-24 md:py-32 px-6 lg:px-20">
      <div className="max-w-4xl mx-auto">
        
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-medium text-zinc-900 tracking-tight mb-6">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-zinc-600">
            Everything you need to know about the product and billing.
          </p>
        </div>

        <div className="flex flex-col border-t border-zinc-200">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div key={index} className="border-b border-zinc-200">
                <button
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  className="w-full flex items-center justify-between py-6 text-left focus:outline-none group"
                >
                  <span className="text-lg md:text-xl font-medium text-zinc-900 group-hover:text-blue-600 transition-colors">
                    {faq.question}
                  </span>
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform duration-300 border border-zinc-200",
                    isOpen ? "rotate-180 bg-blue-600 border-blue-600" : "bg-white"
                  )}>
                    <ChevronDown className={cn("w-4 h-4 transition-colors", isOpen ? "text-white" : "text-zinc-500")} />
                  </div>
                </button>
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-300 ease-in-out",
                    isOpen ? "max-h-[300px] opacity-100 mb-6" : "max-h-0 opacity-0"
                  )}
                >
                  <p className="text-zinc-600 text-lg pr-12">
                    {faq.answer}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        
      </div>
    </section>
  );
};
