import React from 'react';
import { Cpu, Box, Mic, Activity, Globe, Target, Command, Server, Code, Zap, Layers, Cloud } from 'lucide-react';
import { Marquee } from './ui/marquee';

const LOGOS_ROW_1 = [
  { name: 'OpenAI', icon: <Cpu className="w-5 h-5" /> },
  { name: 'Anthropic', icon: <Box className="w-5 h-5" /> },
  { name: 'ElevenLabs', icon: <Mic className="w-5 h-5" /> },
  { name: 'Deepgram', icon: <Activity className="w-5 h-5" /> },
  { name: 'Twilio', icon: <Globe className="w-5 h-5" /> },
  { name: 'Vercel', icon: <Target className="w-5 h-5" /> },
];

const LOGOS_ROW_2 = [
  { name: 'React', icon: <Command className="w-5 h-5" /> },
  { name: 'Node.js', icon: <Server className="w-5 h-5" /> },
  { name: 'TypeScript', icon: <Code className="w-5 h-5" /> },
  { name: 'Tailwind CSS', icon: <Zap className="w-5 h-5" /> },
  { name: 'PostgreSQL', icon: <Layers className="w-5 h-5" /> },
  { name: 'Redis', icon: <Cloud className="w-5 h-5" /> },
];

const LogoCard = ({ logo }: { logo: { name: string; icon: React.ReactNode } }) => (
  <div className="flex items-center justify-center gap-2 px-8 py-2 opacity-40 hover:opacity-100 transition-opacity grayscale hover:grayscale-0 cursor-pointer">
    <div className="text-zinc-400">{logo.icon}</div>
    <span className="text-lg font-bold tracking-tight text-zinc-400">{logo.name}</span>
  </div>
);

export const LogoMarquee: React.FC = () => {
  return (
    <section className="relative flex w-full flex-col items-center justify-center overflow-hidden bg-white py-16 border-b border-zinc-100">
      <Marquee pauseOnHover className="[--duration:40s]">
        {LOGOS_ROW_1.map((logo, idx) => (
          <LogoCard key={`row1-${idx}`} logo={logo} />
        ))}
      </Marquee>
      <Marquee reverse pauseOnHover className="[--duration:40s]">
        {LOGOS_ROW_2.map((logo, idx) => (
          <LogoCard key={`row2-${idx}`} logo={logo} />
        ))}
      </Marquee>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-white"></div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-white"></div>
    </section>
  );
};
