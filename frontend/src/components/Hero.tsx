import React, { useState, useEffect, useCallback } from "react";
import { Button } from "./ui/button";
import Modal from "./ui/modal";
import { UserPlus, Layers, Mic, BarChart3, Zap, Shield, ArrowRight, LogIn, Eye, EyeOff, Code, Globe, Cpu, CheckCircle2, Server, Headphones, Github } from "lucide-react";
import CreateModule from "./CreateModule";
import ContactUploader from "./ContactUploader";
import { VoiceSandbox } from "./VoiceSandbox";
import { AuthModal } from "./AuthModal";
import { useAuth } from "../contexts/AuthContext";
import * as auth from "../lib/auth";
import { getApiBaseUrl } from "../lib/api";
import { Link } from "react-router-dom";
import { DashboardMockup } from "./hero/DashboardMockup";
import { ComparisonSection } from "./ComparisonSection";
import { HighlightsSection } from "./HighlightsSection";
import { CaseStudiesSection } from "./CaseStudiesSection";
import { FaqSection } from "./FaqSection";
import { FooterSection } from "./FooterSection";
import { TestimonialsMarquee } from "./TestimonialsMarquee";
import Navbar from "./Navbar";

const Hero: React.FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [authModal, setAuthModal] = useState<null | 'signup' | 'login'>(null);
  const [createModuleOpen, setCreateModuleOpen] = useState(false);
  const [sandboxOpen, setSandboxOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [userModules, setUserModules] = useState<auth.VoiceModule[]>([]);
  
  // Lifted state to persist across modal closes
  const [ttsProvider, setTtsProvider] = useState<'google' | 'sarvam'>('google');
  const [selectedVoice, setSelectedVoice] = useState('NEERJA');
  const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
  const [selectedModel, setSelectedModel] = useState('gemini');

  const { user } = useAuth();
  
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

  const openAuth = (tab: 'login' | 'signup') => {
    setAuthModal(tab);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setSelectedModule(null);
  };

  return (
    <>
      <Navbar />
      <main className="bg-zinc-950 min-h-screen text-white font-sans selection:bg-indigo-500/30">
        
        {/* === HERO FOLD === */}
        <section className="flex flex-col md:flex-row items-center justify-between pt-32 pb-20 w-full px-6 lg:px-20 bg-[#F5F7FA] min-h-screen relative overflow-hidden">
          
          {/* Left Content */}
          <div className="w-full md:w-1/2 flex flex-col items-start z-10 max-w-2xl mt-10 md:mt-0 relative">
            {/* Badge */}
            <a href="https://github.com/abhigyanraj/voicely" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm mb-8 border border-zinc-200 hover:border-zinc-300 hover:shadow-md transition-all cursor-pointer group">
              <span className="relative flex h-2 w-2 ml-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-medium text-zinc-700 tracking-wide border-r border-zinc-200 pr-2 mr-0.5">Platform v2.0 Live</span>
              <div className="flex items-center gap-1.5 text-zinc-600 group-hover:text-black pr-1 transition-colors">
                <Github className="w-3 h-3" />
                <span className="text-[11px] font-semibold tracking-wide">Open Source</span>
              </div>
            </a>
            
            {/* Heading */}
            <h1 className="text-5xl md:text-6xl lg:text-[4.5rem] font-normal text-[#0A1128] leading-[1.05] tracking-tight mb-6">
              Ship Real-Time AI<br/>Voice Agents Fast
            </h1>
            
            {/* Subheading */}
            <p className="text-base lg:text-[1.05rem] text-zinc-600 mb-8 max-w-md leading-relaxed font-light">
              The ultra-low latency Speech-to-Speech gateway built for modern developers. Connect your infrastructure and automate outbound calling in minutes.
            </p>
            
            {/* CTA */}
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <button 
                onClick={() => setSandboxOpen(true)}
                className="group w-full sm:w-auto relative bg-[#0044FF] hover:bg-blue-700 text-white px-6 py-3.5 rounded-full font-medium text-[13px] flex items-center justify-center gap-2 shadow-[0_8px_20px_-6px_rgba(0,68,255,0.5)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_25px_-8px_rgba(0,68,255,0.6)] active:translate-y-0"
              >
                <Mic className="w-4 h-4 text-white group-hover:animate-pulse transition-colors" />
                Try Sandbox
              </button>
              
              {!user ? (
                <button 
                  onClick={() => openAuth('signup')}
                  className="group w-full sm:w-auto relative bg-white hover:bg-zinc-50 text-zinc-800 px-6 py-3.5 rounded-full font-medium text-[13px] flex items-center justify-center gap-2 shadow-sm border border-zinc-200 transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                >
                  Create Voice Agent
                  <span className="bg-zinc-100 text-zinc-800 rounded-full p-0.5 ml-1 flex items-center justify-center w-4 h-4 group-hover:translate-x-1 transition-transform">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                  </span>
                </button>
              ) : (
                <Link 
                  to="/analytics"
                  className="group w-full sm:w-auto relative bg-white hover:bg-zinc-50 text-zinc-800 px-6 py-3.5 rounded-full font-medium text-[13px] flex items-center justify-center gap-2 shadow-sm border border-zinc-200 transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
                >
                  Create Voice Agent
                  <span className="bg-zinc-100 text-zinc-800 rounded-full p-0.5 ml-1 flex items-center justify-center w-4 h-4 group-hover:translate-x-1 transition-transform">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-3 h-3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                  </span>
                </Link>
              )}
            </div>
          </div>
          
          {/* Right side animation (Abstract Sound Waves) */}
          <div className="w-full md:w-1/2 absolute right-0 top-1/2 -translate-y-1/2 h-[800px] flex justify-end opacity-40 md:opacity-100 pointer-events-none overflow-hidden mix-blend-multiply">
            <div className="relative flex items-center justify-end w-full h-full right-[-10%] md:right-[-5%] gap-1 lg:gap-2">
              <div className="w-16 lg:w-24 h-[40%] bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full blur-2xl animate-[pulse_4s_ease-in-out_infinite]"></div>
              <div className="w-16 lg:w-24 h-[60%] bg-gradient-to-r from-blue-700 to-cyan-300 rounded-full blur-2xl animate-[pulse_5s_ease-in-out_infinite_0.5s]"></div>
              <div className="w-20 lg:w-28 h-[80%] bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full blur-[30px] animate-[pulse_6s_ease-in-out_infinite_1s]"></div>
              <div className="w-24 lg:w-32 h-[90%] bg-gradient-to-r from-cyan-400 to-blue-400 rounded-full blur-[40px] animate-[pulse_5s_ease-in-out_infinite_1.5s]"></div>
              <div className="w-32 lg:w-48 h-[60%] bg-gradient-to-r from-cyan-300 to-white rounded-full blur-[50px] animate-[pulse_7s_ease-in-out_infinite_2s]"></div>
            </div>
          </div>
        </section>

        <TestimonialsMarquee />
        <div id="overview">
          <ComparisonSection />
        </div>
        <div id="highlights">
          <HighlightsSection />
        </div>
        <div id="results">
          <CaseStudiesSection />
        </div>
        <div id="faq">
          <FaqSection />
        </div>
        <FooterSection />

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

        {!!authModal && (
          <AuthModal
            open={!!authModal}
            defaultTab={authModal === 'signup' ? 'signup' : 'login'}
            onClose={() => setAuthModal(null)}
          />
        )}

        <CreateModule open={createModuleOpen} onClose={() => setCreateModuleOpen(false)} />
        <VoiceSandbox open={sandboxOpen} onClose={() => setSandboxOpen(false)} />
      </main>
    </>
  );
};

export default Hero;