import React, { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import Modal from "./ui/modal";
import { UserPlus, Layers, Mic, BarChart3, Zap, Shield, ArrowRight, LogIn, Eye, EyeOff, Code, Globe, Cpu, CheckCircle2, Server, Headphones } from "lucide-react";
import CreateModule from "./CreateModule";
import ContactUploader from "./ContactUploader";
import { VoiceSandbox } from "./VoiceSandbox";
import { useAuth } from "../contexts/AuthContext";
import * as auth from "../lib/auth";
import { getApiBaseUrl } from "../lib/api";
import { Link } from "react-router-dom";

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
  
  const [visitorCount, setVisitorCount] = useState<number | null>(null);

  useEffect(() => {
    // Generate or retrieve visitor ID
    let visitorId = localStorage.getItem('voicely_visitor_id');
    if (!visitorId) {
      visitorId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2);
      localStorage.setItem('voicely_visitor_id', visitorId);
    }

    // Fetch and track visitor count
    const trackVisitor = async () => {
      try {
        const url = `${getApiBaseUrl()}/stats/visitors`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: visitorId })
        });
        const data = await response.json();
        if (data.success && data.count) {
          setVisitorCount(data.count);
        }
      } catch (err) {
        console.error('Failed to track visitor:', err);
      }
    };
    trackVisitor();
  }, []);

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
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: scroll 20s linear infinite;
        }
      `}</style>
      
      <main className="bg-zinc-950 min-h-screen text-white font-sans selection:bg-indigo-500/30">
        
        {/* === HERO FOLD === */}
        <section className="flex flex-col items-center justify-center pt-40 pb-20 w-full text-center px-4 mesh-gradient relative overflow-hidden min-h-[90vh]">
          {/* Premium Grid Background */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none z-0"></div>

          {/* Animated Glow Elements */}
          <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-[60%] h-[50%] bg-white/[0.04] rounded-full blur-[120px] pointer-events-none z-0"></div>
          
          <div className="relative z-10 max-w-5xl mx-auto w-full flex flex-col items-center">
            {/* Unified Top Badge */}
            <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <div className="inline-flex items-center gap-3 px-4 py-1.5 rounded-full bg-white/[0.03] border border-white/[0.08] backdrop-blur-md transition-all hover:bg-white/[0.05] shadow-lg cursor-default">
                <div className="flex items-center gap-2 pr-3 border-r border-white/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-[pulse_2s_ease-in-out_infinite]"></div>
                  <span className="text-[10px] font-medium tracking-[0.1em] uppercase text-zinc-300">Platform v2.0 Live</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-medium tracking-[0.05em] text-zinc-400">
                    <span className="text-white font-semibold mr-1">{visitorCount || "100+"}</span> Total Visitors
                  </span>
                </div>
              </div>
            </div>

            {/* Main Title */}
            <h1 className="text-6xl sm:text-7xl md:text-8xl lg:text-[6.5rem] font-extrabold mb-8 tracking-tighter leading-[1.0] font-[Sora] select-none animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-200">
              <span className="text-white">Ship real-time AI</span>
              <br className="hidden sm:block" />
              <span className="text-zinc-500">voice agents.</span>
            </h1>
            
            <p className="text-sm sm:text-base md:text-[1.125rem] mb-10 max-w-xl mx-auto font-medium text-zinc-400 leading-relaxed px-4 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-300 text-center">
              The open-source, ultra-low latency Speech-to-Speech gateway built for modern developers. Connect your infrastructure in minutes.
            </p>
            
            {/* Action Area */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-20 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-500 w-full px-4 sm:w-auto z-10 relative">
              <Button 
                onClick={() => setSandboxOpen(true)}
                className="h-10 px-6 rounded-full bg-white text-black hover:bg-zinc-200 font-medium text-xs shadow-lg transition-all active:scale-95 w-full sm:w-auto"
              >
                <Mic className="w-3.5 h-3.5 mr-2 text-zinc-900 animate-pulse" />
                Try Voice Sandbox
              </Button>

              {!user ? (
                <Button 
                  variant="outline"
                  onClick={() => openAuth('signup')}
                  className="h-10 px-6 rounded-full border border-white/10 bg-transparent text-zinc-300 hover:text-white hover:bg-white/5 font-medium text-xs transition-all w-full sm:w-auto"
                >
                  <UserPlus className="w-3.5 h-3.5 mr-2" />
                  Get Started Free
                </Button>
              ) : (
                <Link to="/developer" className="h-10 px-6 rounded-full border border-white/10 bg-transparent text-zinc-300 hover:text-white hover:bg-white/5 font-medium text-xs transition-all flex items-center justify-center">
                  <Code className="w-3.5 h-3.5 mr-2" />
                  Developer API
                </Link>
              )}
            </div>
            

            {/* Minimal Developer Dashboard Mockup */}
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
          </div>
          
          {/* Floating Background Text / Decoration */}
          <div className="absolute top-[30%] left-[-5%] text-[15rem] md:text-[20rem] font-bold text-white/[0.02] select-none pointer-events-none font-[Sora]">
            VOICE
          </div>
          <div className="absolute bottom-[20%] right-[-5%] text-[15rem] md:text-[20rem] font-bold text-white/[0.02] select-none pointer-events-none font-[Sora]">
            AI
          </div>
        </section>

        {/* === TRUSTED BY MARQUEE === */}
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

        {/* === ARCHITECTURE SECTION === */}
        <section className="relative w-full overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[300px] bg-white/[0.03] rounded-full blur-[120px] pointer-events-none"></div>
          <div className="py-32 px-4 w-full max-w-5xl mx-auto border-t border-white/[0.02] relative z-20">
            <div className="text-center mb-24">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">How it <span className="text-zinc-500">works.</span></h2>
            <p className="text-zinc-500 max-w-xl mx-auto text-sm">We handle the complex audio buffers, binary streaming, and AI orchestration so you don't have to.</p>
          </div>
          
          <div className="relative w-full max-w-4xl mx-auto">
            {/* The continuous line track */}
            <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/[0.02] -translate-y-1/2 hidden md:block overflow-hidden">
              {/* Glowing animated pulse along the line */}
              <div className="h-full w-48 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[scroll_4s_linear_infinite]" style={{ transform: 'translateX(-100%)' }}></div>
            </div>

            <div className="flex flex-col md:flex-row justify-between relative z-10 gap-12 md:gap-0">
              {/* Node 1 */}
              <div className="flex flex-col items-center group w-full md:w-64">
                <div className="w-16 h-16 rounded-full bg-white/[0.02] flex items-center justify-center mb-6 relative z-10 group-hover:bg-white/[0.04] transition-colors">
                  <Mic className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                </div>
                <div className="text-center">
                  <h4 className="font-bold text-zinc-200 mb-2 text-sm">Raw Audio In</h4>
                  <p className="text-xs text-zinc-600 leading-relaxed">Stream 16kHz PCM audio straight from the browser microphone or telephony providers.</p>
                </div>
              </div>

              {/* Node 2 */}
              <div className="flex flex-col items-center group w-full md:w-64">
                <div className="bg-zinc-900 border border-zinc-800 text-zinc-400 text-[9px] font-bold px-3 py-1 rounded-full uppercase tracking-widest whitespace-nowrap mb-3">Core Engine</div>
                <div className="w-16 h-16 rounded-full bg-white/[0.05] flex items-center justify-center mb-6 relative z-10 md:-mt-0">
                  <div className="absolute inset-0 bg-white/5 rounded-full blur-md pointer-events-none"></div>
                  <Layers className="w-5 h-5 text-zinc-300 relative z-10" />
                </div>
                <div className="text-center">
                  <h4 className="font-bold text-zinc-200 mb-2 text-sm">Voicely Pipeline</h4>
                  <p className="text-xs text-zinc-600 leading-relaxed">Deepgram (STT) → Groq (LLM) → Cartesia (TTS) orchestrated at ultra-low latency.</p>
                </div>
              </div>

              {/* Node 3 */}
              <div className="flex flex-col items-center group w-full md:w-64">
                <div className="w-16 h-16 rounded-full bg-white/[0.02] flex items-center justify-center mb-6 relative z-10 group-hover:bg-white/[0.04] transition-colors">
                   <Headphones className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                </div>
                <div className="text-center">
                  <h4 className="font-bold text-zinc-200 mb-2 text-sm">AI Audio Out</h4>
                  <p className="text-xs text-zinc-600 leading-relaxed">Receive generated audio buffers directly back through the socket for seamless playback.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        </section>

        {/* === CODE SECTION === */}
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

        {/* === BENTO GRID SECTION === */}
        <section className="relative w-full overflow-hidden">
          <div className="absolute top-1/2 left-0 w-[600px] h-[600px] bg-white/[0.03] rounded-full blur-[120px] pointer-events-none -translate-x-1/2"></div>
          <div className="py-32 px-4 w-full max-w-5xl mx-auto border-t border-white/[0.02] relative z-10">
            <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">Enterprise <span className="text-zinc-500">features.</span></h2>
            <p className="text-zinc-500 max-w-xl mx-auto text-sm">Everything you need to deploy production-ready voice agents at scale.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Bento Card 1 */}
            <div className="bg-[#09090b] border border-white/[0.05] p-8 rounded-2xl md:col-span-2 flex flex-col justify-between min-h-[280px] relative overflow-hidden group hover:border-white/[0.1] transition-colors">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] rounded-full blur-[100px] pointer-events-none group-hover:bg-white/[0.04] transition-colors"></div>
              
              {/* Micro UI: Dropdown selector */}
              <div className="self-end mb-8 w-48 bg-[#09090b] border border-white/[0.05] rounded-lg p-1.5 shadow-2xl transform group-hover:-translate-y-1 transition-transform">
                <div className="flex items-center justify-between p-2 bg-white/[0.03] rounded-md cursor-default border border-white/[0.02]">
                  <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-zinc-400"/> <span className="text-xs text-zinc-200 font-medium">Groq Llama 3</span></div>
                  <CheckCircle2 className="w-3.5 h-3.5 text-white"/>
                </div>
                <div className="flex items-center justify-between p-2 hover:bg-white/[0.02] rounded-md cursor-default opacity-40">
                  <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-zinc-500"/> <span className="text-xs text-zinc-400 font-medium">GPT-4o</span></div>
                </div>
                <div className="flex items-center justify-between p-2 hover:bg-white/[0.02] rounded-md cursor-default opacity-40">
                  <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5 text-zinc-500"/> <span className="text-xs text-zinc-400 font-medium">Claude 3.5</span></div>
                </div>
              </div>
              
              <div className="relative z-10">
                <Server className="w-5 h-5 text-white mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Agnostic AI Pipeline</h3>
                <p className="text-sm text-zinc-500 max-w-sm leading-relaxed">Swap between OpenAI, Gemini, Llama, Deepgram, and Cartesia on the fly. Don't get locked into a single provider's ecosystem.</p>
              </div>
            </div>
            
            {/* Bento Card 2 */}
            <div className="bg-[#09090b] border border-white/[0.05] p-8 rounded-2xl flex flex-col justify-between min-h-[280px] relative overflow-hidden group hover:border-white/[0.1] transition-colors">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] rounded-full blur-[100px] pointer-events-none group-hover:bg-white/[0.04] transition-colors"></div>
              
              {/* Micro UI: API Key hidden */}
              <div className="self-end mb-8 bg-black border border-white/[0.08] rounded-md px-3 py-2 flex items-center gap-2 font-mono text-[10px] text-zinc-500 shadow-xl group-hover:scale-105 transition-transform">
                sk-<span className="tracking-widest">••••••••••••</span>
              </div>

              <div className="relative z-10">
                <Shield className="w-5 h-5 text-white mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Bring Your Own Key</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">Your API keys are encrypted at rest. You only pay for your own provider usage.</p>
              </div>
            </div>

            {/* Bento Card 3 */}
            <div className="bg-[#09090b] border border-white/[0.05] p-8 rounded-2xl flex flex-col justify-between min-h-[280px] relative overflow-hidden group hover:border-white/[0.1] transition-colors">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] rounded-full blur-[100px] pointer-events-none group-hover:bg-white/[0.04] transition-colors"></div>
              
              {/* Micro UI: Live recording indicator */}
              <div className="self-end mb-8 flex items-center gap-2 bg-white/[0.03] border border-white/[0.08] px-3 py-1.5 rounded-full shadow-lg group-hover:bg-white/[0.06] transition-colors">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
                <span className="text-[9px] font-medium uppercase tracking-widest text-zinc-300">Live Call</span>
              </div>

              <div className="relative z-10">
                <Zap className="w-5 h-5 text-white mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Live Intervention</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">Monitor ongoing calls in real-time and manually intervene if the AI agent gets stuck.</p>
              </div>
            </div>
            
            {/* Bento Card 4 */}
            <div className="bg-[#09090b] border border-white/[0.05] p-8 rounded-2xl md:col-span-2 flex flex-col justify-between min-h-[280px] relative overflow-hidden group hover:border-white/[0.1] transition-colors">
              <div className="absolute top-0 left-0 w-64 h-64 bg-white/[0.02] rounded-full blur-[100px] pointer-events-none group-hover:bg-white/[0.04] transition-colors"></div>
              
              {/* Micro UI: Mini bar chart */}
              <div className="self-end mb-8 flex items-end gap-1.5 h-16 opacity-60 group-hover:opacity-100 transition-opacity">
                {[40, 70, 45, 90, 60, 30, 80].map((h, i) => (
                  <div key={i} className="w-2 md:w-3 bg-white/[0.08] rounded-sm group-hover:bg-white/[0.2] transition-colors relative" style={{ height: `${h}%`, transitionDelay: `${i * 50}ms` }}>
                    <div className="absolute top-0 left-0 w-full h-0.5 bg-white/40 rounded-t-sm"></div>
                  </div>
                ))}
              </div>

              <div className="relative z-10">
                <BarChart3 className="w-5 h-5 text-white mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">Deep Journey Analytics</h3>
                <p className="text-sm text-zinc-500 max-w-sm leading-relaxed">High-fidelity timelines, sentiment tracking, and automated recurring callback logic built directly into the dashboard.</p>
              </div>
            </div>
          </div>
        </div>
        </section>

        {/* === CTA / FOOTER === */}
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

        {/* Minimal Footer */}
        <footer className="border-t border-white/5 py-8 text-center bg-black">
          <div className="flex flex-col md:flex-row items-center justify-between max-w-5xl mx-auto px-6">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <img src="/logo.png" alt="Voicely" className="h-6 w-auto opacity-50 grayscale" />
              <span className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest">© 2026 Voicely</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
              <Link to="/developer/docs" className="hover:text-white transition-colors">Documentation</Link>
              {user && <Link to="/developer" className="hover:text-white transition-colors">API Keys</Link>}
              {user && <Link to="/settings" className="hover:text-white transition-colors">Settings</Link>}
            </div>
          </div>
        </footer>

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
            <div className="w-full flex bg-white/[0.03] rounded-lg p-1 mb-6 border border-white/[0.05]">
              <button
                onClick={() => { setAuthTab('login'); setAuthError(''); }}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                  authTab === 'login' ? 'bg-[#1A1A1A] text-white border border-white/10 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => { setAuthTab('signup'); setAuthError(''); }}
                className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-all ${
                  authTab === 'signup' ? 'bg-[#1A1A1A] text-white border border-white/10 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
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
                  className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-all disabled:opacity-50 h-10"
                />
              )}
              <input
                type="email" placeholder="Email address" value={authEmail}
                onChange={e => setAuthEmail(e.target.value)} required disabled={authSubmitting}
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-all disabled:opacity-50 h-10"
              />
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  placeholder={authTab === 'signup' ? 'Password (min 6 chars)' : 'Password'}
                  value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                  required disabled={authSubmitting}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 pr-10 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-all disabled:opacity-50 h-10"
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
                className="w-full h-10 rounded-lg bg-white text-black hover:bg-zinc-200 text-sm font-medium transition-all disabled:opacity-60 shadow-none mt-2"
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
              className="w-full h-10 rounded-lg bg-white/[0.03] border border-white/10 text-white text-sm font-medium flex items-center justify-center gap-2 hover:bg-white/[0.05] transition-all disabled:opacity-60"
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
      </main>
    </>
  );
};

export default Hero;