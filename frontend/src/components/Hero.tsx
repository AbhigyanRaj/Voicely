import React, { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import Modal from "./ui/modal";
import { UserPlus, Layers, Mic, BarChart3, Zap, Shield, ArrowRight, LogIn } from "lucide-react";
import CreateModule from "./CreateModule";
import ContactUploader from "./ContactUploader";
import { useAuth } from "../contexts/AuthContext";
import * as auth from "../lib/auth";

const featureData = [
  {
    icon: <Mic className="w-6 h-6 text-indigo-500" />, bg: "bg-indigo-50/10", title: "Lead Intelligence", desc: "Behavioral analysis and deep sentiment tracking."
  },
  {
    icon: <Layers className="w-6 h-6 text-emerald-500" />, bg: "bg-emerald-50/10", title: "Journey Tracking", desc: "High-fidelity timelines with automated follow-ups."
  },
  {
    icon: <Zap className="w-6 h-6 text-amber-500" />, bg: "bg-amber-50/10", title: "Live Intervention", desc: "Real-time monitoring and manual AI course-correction."
  },
  {
    icon: <BarChart3 className="w-6 h-6 text-rose-500" />, bg: "bg-rose-50/10", title: "Smart Workflows", desc: "Automated scheduling and recurring callback logic."
  },
];

const Hero: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [authModal, setAuthModal] = useState<null | 'signup' | 'login'>(null);
  const [createModuleOpen, setCreateModuleOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<any>(null);
  const [userModules, setUserModules] = useState<any[]>([]);
  
  // Lifted state to persist across modal closes
  const [ttsProvider, setTtsProvider] = useState<'google' | 'sarvam'>('google');
  const [selectedVoice, setSelectedVoice] = useState('NEERJA');
  const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
  const [selectedModel, setSelectedModel] = useState('gemini');

  const { user, signIn, loading } = useAuth();
  
  const loadUserModules = useCallback(async () => {
    if (!user) return;
    
    try {
      const modules = await auth.getUserModules();
      setUserModules(modules);
    } catch (error) {
      console.error('Failed to load modules:', error);
    }
  }, [user]);

  // Load user modules when modal opens
  useEffect(() => {
    if (modalOpen && user) {
      loadUserModules();
      setSelectedModule(null);
    }
  }, [modalOpen, user, loadUserModules]);

  const handleSignIn = async () => {
    try {
      await signIn();
      setAuthModal(null);
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedModule(null);
  };

  return (
    <>
      <style>{`
        @keyframes subtle-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-subtle-float {
          animation: subtle-float 6s ease-in-out infinite;
        }
        .mesh-gradient {
          background-image: 
            radial-gradient(at 0% 0%, hsla(253,16%,7%,1) 0, transparent 50%), 
            radial-gradient(at 50% 0%, hsla(225,39%,30%,0.2) 0, transparent 50%), 
            radial-gradient(at 100% 0%, hsla(339,49%,30%,0.2) 0, transparent 50%);
        }
      `}</style>
      
      <section className="flex flex-col items-center justify-center min-h-screen w-full text-center px-4 mesh-gradient bg-zinc-950 text-white relative overflow-hidden pt-12">
        {/* Animated Glow Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-rose-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
        
        <div className="relative z-10 max-w-5xl mx-auto w-full flex flex-col items-center">
          {/* Version Badge */}
          <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></div>
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400">Platform v2.0 Live</span>
            </div>
          </div>

          {/* Main Title */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-6 tracking-[-0.04em] leading-[0.9] font-[Sora] select-none bg-gradient-to-b from-white to-white/50 bg-clip-text text-transparent px-2 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
            Voicely
          </h1>
          
          <p className="text-sm sm:text-base md:text-lg mb-10 max-w-xl mx-auto font-medium text-zinc-400 leading-relaxed px-4 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-300">
            Advanced AI Voice Automation for Seamless Lead Qualification and Intelligent Journey Management.
          </p>
          
          {/* Refined Action Area */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-20 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-500">
            {!user ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <Button 
                  onClick={() => setAuthModal('signup')}
                  className="h-14 px-8 rounded-2xl bg-white text-black hover:bg-zinc-200 font-bold text-sm shadow-[0_20px_40px_-15px_rgba(255,255,255,0.2)] transition-all hover:scale-105 active:scale-95"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  GET STARTED
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setAuthModal('login')}
                  className="h-14 px-8 rounded-2xl border-white/10 bg-white/5 backdrop-blur-md text-white hover:bg-white/10 font-bold text-sm transition-all"
                >
                  <LogIn className="w-4 h-4 mr-2" />
                  SIGN IN
                </Button>
              </div>
            ) : (
              <Button 
                onClick={() => setCreateModuleOpen(true)}
                className="h-14 px-10 rounded-2xl bg-white text-black hover:bg-zinc-200 font-bold text-sm shadow-[0_20px_40px_-15px_rgba(255,255,255,0.2)] transition-all hover:scale-105 active:scale-95"
              >
                <Layers className="w-4 h-4 mr-2" />
                CREATE VOICE AGENT
              </Button>
            )}
            
            <button 
              onClick={() => setModalOpen(true)}
              className="group flex items-center gap-2 text-zinc-500 hover:text-white transition-colors font-bold text-sm uppercase tracking-widest px-4 h-14"
            >
              START A CALL
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Integrated Feature Bar */}
          <div className="w-full max-w-5xl px-4 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-700">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/5 border border-white/5 rounded-[2.5rem] overflow-hidden backdrop-blur-sm shadow-2xl">
              {featureData.map((f, i) => (
                <div key={i} className="p-8 bg-zinc-950/40 hover:bg-white/[0.02] transition-colors border-r border-b border-white/5 last:border-r-0">
                  <div className="mb-4 inline-flex p-3 rounded-2xl bg-white/5 text-white/80 ring-1 ring-white/10">
                    {React.cloneElement(f.icon as any, { className: 'w-5 h-5' })}
                  </div>
                  <h3 className="text-sm font-bold text-white mb-2 uppercase tracking-wider">{f.title}</h3>
                  <p className="text-[11px] text-zinc-500 leading-normal font-medium">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="mt-20 flex flex-wrap items-center justify-center gap-8 md:gap-12 opacity-30 grayscale hover:opacity-100 transition-opacity duration-500 cursor-default">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Enterprise Safe</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Low Latency</span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest">Deep Insights</span>
            </div>
          </div>
        </div>

        {/* Floating Background Text / Decoration */}
        <div className="absolute top-[20%] left-[-5%] text-[20rem] font-bold text-white/[0.02] select-none pointer-events-none font-[Sora]">
          VOICE
        </div>
        <div className="absolute bottom-[10%] right-[-5%] text-[20rem] font-bold text-white/[0.02] select-none pointer-events-none font-[Sora]">
          AI
        </div>

        {/* Modals */}
        <Modal open={modalOpen} onClose={handleModalClose}>
          <div className="w-full max-w-md mx-auto">
            <h2 className="text-xl font-bold text-white mb-2 text-center uppercase tracking-tighter">Get Started</h2>
            <p className="text-xs text-zinc-500 mb-8 text-center font-medium">Upload your lead data to begin the evolution.</p>
            <ContactUploader
              userModules={userModules}
              selectedModule={selectedModule}
              ttsProvider={ttsProvider}
              setTtsProvider={setTtsProvider}
              selectedVoice={selectedVoice}
              setSelectedVoice={setSelectedVoice}
              selectedLanguage={selectedLanguage}
              setSelectedLanguage={setSelectedLanguage}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              onSubmit={() => {
                setModalOpen(false);
                setSelectedModule(null);
              }}
              onClose={handleModalClose}
            />
          </div>
        </Modal>

        <Modal open={!!authModal} onClose={() => setAuthModal(null)}>
          <div className="w-full max-w-sm mx-auto p-4 flex flex-col items-center">
            <div className="w-16 h-16 bg-white/5 rounded-[2rem] flex items-center justify-center mb-6 ring-1 ring-white/10">
              <UserPlus className="w-8 h-8 text-white/50" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2 text-center tracking-tight">{authModal === 'signup' ? 'Join Voicely' : 'Welcome Back'}</h2>
            <p className="text-zinc-500 text-sm mb-8 text-center font-medium">Connect your account via secure channel</p>
            <div className="w-full space-y-4">
              <Button
                className="w-full h-14 justify-center bg-white text-black hover:bg-zinc-200 font-bold rounded-2xl transition-all shadow-xl"
                onClick={handleSignIn}
                disabled={loading}
              >
                <svg className="w-5 h-5 mr-3" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.23l6.85-6.85C35.64 2.39 30.18 0 24 0 14.82 0 6.73 5.48 2.69 13.44l7.98 6.2C12.13 13.09 17.62 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.1 24.55c0-1.64-.15-3.22-.42-4.74H24v9.01h12.42c-.54 2.9-2.18 5.36-4.65 7.03l7.19 5.6C43.98 37.13 46.1 31.34 46.1 24.55z"/>
                  <path fill="#FBBC05" d="M10.67 28.09c-1.01-2.99-1.01-6.19 0-9.18l-7.98-6.2C.99 16.36 0 20.05 0 24c0 3.95.99 7.64 2.69 11.29l7.98-6.2z"/>
                  <path fill="#34A853" d="M24 48c6.18 0 11.36-2.05 15.15-5.59l-7.19-5.6c-2.01 1.35-4.59 2.15-7.96 2.15-6.38 0-11.87-3.59-14.33-8.79l-7.98 6.2C6.73 42.52 14.82 48 24 48z"/>
                </svg>
                {loading ? 'Authenticating...' : 'Sign in with Google'}
              </Button>
              <p className="text-[10px] text-zinc-600 text-center font-bold uppercase tracking-widest">
                Protected by Voicely Security Protocols
              </p>
            </div>
          </div>
        </Modal>

        <CreateModule open={createModuleOpen} onClose={() => setCreateModuleOpen(false)} />
      </section>
    </>
  );
};

export default Hero;