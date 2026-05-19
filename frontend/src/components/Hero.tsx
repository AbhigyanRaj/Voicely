import React, { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import Modal from "./ui/modal";
import { UserPlus, Layers, Mic, BarChart3, Zap, Shield, ArrowRight, LogIn, Eye, EyeOff } from "lucide-react";
import CreateModule from "./CreateModule";
import ContactUploader from "./ContactUploader";
import { VoiceSandbox } from "./VoiceSandbox";
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
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<any>(null);
  const [userModules, setUserModules] = useState<any[]>([]);
  
  // Lifted state to persist across modal closes
  const [ttsProvider, setTtsProvider] = useState<'google' | 'sarvam'>('google');
  const [selectedVoice, setSelectedVoice] = useState('NEERJA');
  const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
  const [selectedModel, setSelectedModel] = useState('gemini');

  const { user, signIn, emailRegister, emailLogin, loading } = useAuth();
  
  const loadUserModules = useCallback(async () => {
    if (!user) return;
    try {
      const modules = await auth.getUserModules();
      setUserModules(modules);
    } catch (error) {
      console.error('Failed to load modules:', error);
    }
  }, [user]);

  useEffect(() => {
    if (modalOpen && user) {
      loadUserModules();
      setSelectedModule(null);
    }
  }, [modalOpen, user, loadUserModules]);

  // Auth form state
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const openAuth = (tab: 'login' | 'signup') => {
    setAuthTab(tab);
    setAuthError('');
    setAuthName('');
    setAuthEmail('');
    setAuthPassword('');
    setAuthModal(tab);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSubmitting(true);
    try {
      if (authTab === 'signup') {
        await emailRegister(authName.trim(), authEmail.trim(), authPassword);
      } else {
        await emailLogin(authEmail.trim(), authPassword);
      }
      setAuthModal(null);
    } catch (err: any) {
      setAuthError(err.message || 'Something went wrong.');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleGoogle = () => {
    signIn();
    setAuthModal(null);
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
      
      <section className="flex flex-col items-center justify-center min-h-screen w-full text-center px-4 mesh-gradient bg-zinc-950 text-white relative overflow-hidden pt-16 pb-12">
        {/* Animated Glow Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-rose-500/10 rounded-full blur-[120px] pointer-events-none" style={{ animationDelay: '2s' }}></div>
        
        <div className="relative z-10 max-w-5xl mx-auto w-full flex flex-col items-center">
          {/* Version Badge */}
          <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></div>
              <span className="text-[9px] font-bold tracking-[0.2em] uppercase text-zinc-400">Platform v2.0 Live</span>
            </div>
          </div>

          {/* Main Title */}
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold mb-4 tracking-[-0.04em] leading-[0.95] font-[Sora] select-none bg-gradient-to-b from-white to-white/50 bg-clip-text text-transparent px-2 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
            Voicely
          </h1>
          
          <p className="text-xs sm:text-sm md:text-base mb-8 max-w-lg mx-auto font-medium text-zinc-400 leading-relaxed px-4 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-300">
            Advanced AI Voice Automation for Seamless Lead Qualification and Intelligent Journey Management.
          </p>
          
          {/* Refined Action Area */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-16 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-500 w-full px-4 sm:w-auto">
            {!user ? (
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Button 
                  onClick={() => openAuth('signup')}
                  className="h-11 px-6 rounded-full bg-white text-black hover:bg-zinc-200 font-bold text-xs shadow-md transition-all hover:scale-105 active:scale-95 w-full sm:w-auto"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-2" />
                  GET STARTED
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => openAuth('login')}
                  className="h-11 px-6 rounded-full border-white/10 bg-white/5 backdrop-blur-md text-white hover:bg-white/10 font-bold text-xs transition-all w-full sm:w-auto"
                >
                  <LogIn className="w-3.5 h-3.5 mr-2" />
                  SIGN IN
                </Button>
              </div>
            ) : (
              <Button 
                onClick={() => setSandboxOpen(true)}
                className="h-11 px-8 rounded-full bg-white text-black hover:bg-zinc-200 font-bold text-xs shadow-md transition-all hover:scale-105 active:scale-95 w-full sm:w-auto"
              >
                <Mic className="w-3.5 h-3.5 mr-2 text-indigo-600 animate-pulse" />
                TRY VOICE AGENT
              </Button>
            )}
            
            <button 
              onClick={() => setModalOpen(true)}
              className="group flex items-center justify-center gap-2 text-zinc-500 hover:text-white transition-colors font-bold text-xs uppercase tracking-widest px-4 h-11 w-full sm:w-auto"
            >
              START A CALL
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>

          {/* Integrated Feature Bar */}
          <div className="w-full max-w-5xl px-4 animate-in fade-in slide-in-from-bottom-12 duration-1000 delay-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-px bg-white/5 border border-white/5 rounded-3xl overflow-hidden backdrop-blur-sm shadow-2xl">
              {featureData.map((f, i) => (
                <div key={i} className="p-6 sm:p-8 bg-zinc-950/40 hover:bg-white/[0.02] transition-colors border-r border-b border-white/5 last:border-r-0 md:last:border-b-0">
                  <div className="mb-3 inline-flex p-2.5 rounded-xl bg-white/5 text-white/80 ring-1 ring-white/10">
                    {React.cloneElement(f.icon as any, { className: 'w-4 h-4' })}
                  </div>
                  <h3 className="text-xs font-bold text-white mb-1.5 uppercase tracking-wider">{f.title}</h3>
                  <p className="text-[10px] text-zinc-500 leading-normal font-medium">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-6 md:gap-10 opacity-30 grayscale hover:opacity-100 transition-opacity duration-500 cursor-default">
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Enterprise Safe</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Low Latency</span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-3.5 h-3.5" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Deep Insights</span>
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
        <Modal open={modalOpen} onClose={handleModalClose} maxWidth="max-w-lg">
          <div className="w-full p-6 sm:p-8 flex flex-col">
            <h2 className="text-xl font-bold text-white mb-2 text-center uppercase tracking-tighter">Get Started</h2>
            <p className="text-xs text-zinc-500 mb-6 text-center font-medium">Upload your lead data to begin the evolution.</p>
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
          <div className="w-full max-w-sm mx-auto p-8 flex flex-col items-center">
            <h2 className="text-2xl font-bold text-white mb-1 tracking-tight">
              {authTab === 'login' ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-zinc-500 text-sm mb-6 text-center">
              {authTab === 'login' ? 'Sign in to your Voicely account' : 'Get started with Voicely for free'}
            </p>

            {/* Tab switcher */}
            <div className="w-full flex bg-white/5 rounded-xl p-1 mb-6 border border-white/5">
              <button
                onClick={() => { setAuthTab('login'); setAuthError(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  authTab === 'login' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setAuthTab('signup'); setAuthError(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  authTab === 'signup' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Sign Up
              </button>
            </div>

            {/* Email form */}
            <form onSubmit={handleEmailSubmit} className="w-full space-y-3">
              {authTab === 'signup' && (
                <input
                  type="text" placeholder="Full name" value={authName}
                  onChange={e => setAuthName(e.target.value)} required disabled={authSubmitting}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all disabled:opacity-50"
                />
              )}
              <input
                type="email" placeholder="Email address" value={authEmail}
                onChange={e => setAuthEmail(e.target.value)} required disabled={authSubmitting}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all disabled:opacity-50"
              />
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder={authTab === 'signup' ? 'Password (min 6 chars)' : 'Password'}
                  value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                  required disabled={authSubmitting}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all disabled:opacity-50"
                />
                <button type="button" onClick={() => setShowPwd(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {authError && (
                <p className="text-red-400 text-xs font-medium bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  {authError}
                </p>
              )}
              <Button type="submit" disabled={authSubmitting}
                className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:scale-100 shadow-[0_8px_24px_-8px_rgba(99,102,241,0.5)]"
              >
                {authSubmitting ? 'Please wait...' : authTab === 'login' ? 'Sign In' : 'Create Account'}
              </Button>
            </form>

            {/* Divider */}
            <div className="w-full flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-white/8" />
              <span className="text-zinc-600 text-xs font-medium uppercase tracking-widest">or</span>
              <div className="flex-1 h-px bg-white/8" />
            </div>

            {/* Google */}
            <button onClick={handleGoogle} disabled={authSubmitting}
              className="w-full h-11 rounded-xl bg-white text-black text-sm font-bold flex items-center justify-center gap-3 hover:bg-zinc-100 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:scale-100"
            >
              <svg className="w-4 h-4" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.23l6.85-6.85C35.64 2.39 30.18 0 24 0 14.82 0 6.73 5.48 2.69 13.44l7.98 6.2C12.13 13.09 17.62 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.1 24.55c0-1.64-.15-3.22-.42-4.74H24v9.01h12.42c-.54 2.9-2.18 5.36-4.65 7.03l7.19 5.6C43.98 37.13 46.1 31.34 46.1 24.55z"/>
                <path fill="#FBBC05" d="M10.67 28.09c-1.01-2.99-1.01-6.19 0-9.18l-7.98-6.2C.99 16.36 0 20.05 0 24c0 3.95.99 7.64 2.69 11.29l7.98-6.2z"/>
                <path fill="#34A853" d="M24 48c6.18 0 11.36-2.05 15.15-5.59l-7.19-5.6c-2.01 1.35-4.59 2.15-7.96 2.15-6.38 0-11.87-3.59-14.33-8.79l-7.98 6.2C6.73 42.52 14.82 48 24 48z"/>
              </svg>
              Continue with Google
            </button>

            <p className="text-[10px] text-zinc-700 text-center font-medium mt-5">
              By continuing you agree to our Terms of Service and Privacy Policy
            </p>
          </div>
        </Modal>

        <CreateModule open={createModuleOpen} onClose={() => setCreateModuleOpen(false)} />
        <VoiceSandbox open={sandboxOpen} onClose={() => setSandboxOpen(false)} />
      </section>
    </>
  );
};

export default Hero;