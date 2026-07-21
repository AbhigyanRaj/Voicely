import React from 'react';
import { Button } from '../ui/button';
import { Mic } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface CtaSectionProps {
  openAuth: (tab: 'signup' | 'login') => void;
  setSandboxOpen: (open: boolean) => void;
}

export const CtaSection: React.FC<CtaSectionProps> = ({ openAuth, setSandboxOpen }) => {
  const { user } = useAuth();
  return (
    <section className="py-32 px-4 w-full border-t border-white/5 relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute bottom-[-20%] left-1/2 -translate-x-1/2 w-[60%] h-[60%] bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none"></div>
      
      <div className="max-w-3xl mx-auto text-center relative z-10 flex flex-col items-center">
        <h2 className="text-4xl md:text-6xl font-bold mb-6 tracking-tight">Ready to start building?</h2>
        <p className="text-zinc-400 mb-10 max-w-lg text-sm leading-relaxed">
          Create your first AI voice agent in minutes. Test it in the Sandbox, then deploy it with the Developer API.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          {!user ? (
            <Button 
              onClick={() => openAuth('signup')}
              className="h-12 px-8 rounded-full bg-white text-black hover:bg-zinc-200 font-bold text-sm shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] transition-all hover:scale-105 active:scale-95 w-full sm:w-auto"
            >
              CREATE FREE ACCOUNT
            </Button>
          ) : (
            <Button 
              onClick={() => setSandboxOpen(true)}
              className="h-12 px-8 rounded-full bg-white text-black hover:bg-zinc-200 font-bold text-sm shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)] transition-all hover:scale-105 active:scale-95 w-full sm:w-auto"
            >
              <Mic className="w-4 h-4 mr-2 text-indigo-600 animate-pulse" />
              OPEN SANDBOX
            </Button>
          )}
        </div>
      </div>
    </section>
  );
};
