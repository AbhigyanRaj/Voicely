import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import * as auth from "../lib/auth";
import { 
  X, 
  Loader2, 
  Languages, 
  Briefcase, 
  Waves, 
  Zap,
  Calendar,
  Search,
  ShieldCheck,
  TrendingUp,
  BrainCircuit
} from "lucide-react";
import Modal from "./ui/modal";
import { z } from "zod";

const brandSchema = z.object({
  name: z.string().min(1, 'Please give your agent a name'),
});

const personaSchema = z.object({
  questions: z.array(z.string()).refine(arr => arr.some(q => q.trim().length > 0), { message: 'Add at least one question for your agent to ask' })
});

import { GOOGLE_LANGUAGES, GOOGLE_VOICES, SARVAM_LANGUAGES, SARVAM_VOICES, CARTESIA_LANGUAGES, CARTESIA_VOICES, DEEPGRAM_LANGUAGES, DEEPGRAM_VOICES } from "../lib/ttsConfig";

interface CreateModuleProps {
  open: boolean;
  onClose: () => void;
}

type Step = 'brand' | 'persona' | 'voice' | 'features';

const CreateModule: React.FC<CreateModuleProps> = ({ open, onClose }) => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>('brand');
  const [moduleName, setModuleName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [questions, setQuestions] = useState<string[]>([""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [translating, setTranslating] = useState<number | null>(null);

  const [ttsProvider, setTtsProvider] = useState<"google" | "sarvam" | "cartesia" | "deepgram">("sarvam");
  const [selectedLanguage, setSelectedLanguage] = useState("hi-IN");
  const [selectedVoice, setSelectedVoice] = useState("anushka");

  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const features = [
    { id: 'sales', name: 'Deal Closer', icon: <TrendingUp className="w-4 h-4" />, desc: 'Negotiation & Discount logic' },
    { id: 'appointments', name: 'Medical/Clinic', icon: <Calendar className="w-4 h-4" />, desc: 'Scheduling & Rescheduling' },
    { id: 'leads', name: 'Real Estate Qualifier', icon: <Search className="w-4 h-4" />, desc: 'Qualification & Intent tiering' },
    { id: 'recovery', name: 'E-commerce Recovery', icon: <ShieldCheck className="w-4 h-4" />, desc: 'Trust & Friction resolution' }
  ];

  const handleProviderChange = (provider: "google" | "sarvam" | "cartesia" | "deepgram") => {
    setTtsProvider(provider);
    if (provider === "google") {
      setSelectedLanguage("en-IN");
      setSelectedVoice("NEERJA");
    } else if (provider === "sarvam") {
      setSelectedLanguage("hi-IN");
      setSelectedVoice("anushka");
    } else if (provider === "cartesia") {
      setSelectedLanguage("en-US");
      setSelectedVoice("79a125e8-cd45-4c13-8a67-188112f4dd22");
    } else if (provider === "deepgram") {
      setSelectedLanguage("en-US");
      setSelectedVoice("aura-asteria-en");
    }
  };

  const currentLanguages = ttsProvider === "google" ? GOOGLE_LANGUAGES : ttsProvider === "sarvam" ? SARVAM_LANGUAGES : ttsProvider === "cartesia" ? CARTESIA_LANGUAGES : DEEPGRAM_LANGUAGES;
  const currentVoices = ttsProvider === "google" ? GOOGLE_VOICES[selectedLanguage] || [] : ttsProvider === "sarvam" ? SARVAM_VOICES[selectedLanguage] || [] : ttsProvider === "cartesia" ? CARTESIA_VOICES[selectedLanguage] || [] : DEEPGRAM_VOICES[selectedLanguage] || [];

  const addQuestion = () => setQuestions([...questions, ""]);
  
  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const updateQuestion = (index: number, value: string) => {
    const updated = [...questions];
    updated[index] = value;
    setQuestions(updated);
  };

  const translateToHindi = async (index: number) => {
    const questionText = questions[index].trim();
    if (!questionText) return;
    setTranslating(index);
    try {
      const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(questionText)}&langpair=en|hi`);
      const data = await response.json();
      if (data.responseData?.translatedText) updateQuestion(index, data.responseData.translatedText);
    } catch (err) {
      console.error("Translation error:", err);
    } finally {
      setTranslating(null);
    }
  };

  const validateStep = () => {
    setError("");
    try {
      if (currentStep === 'brand') {
        brandSchema.parse({ name: moduleName.trim() });
      } else if (currentStep === 'persona') {
        personaSchema.parse({ questions });
      }
      return true;
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        setError(e.errors[0].message);
      }
      return false;
    }
  };

  const nextStep = () => {
    if (!validateStep()) return;
    if (currentStep === 'brand') setCurrentStep('persona');
    else if (currentStep === 'persona') setCurrentStep('voice');
    else if (currentStep === 'voice') setCurrentStep('features');
  };

  const prevStep = () => {
    if (currentStep === 'persona') setCurrentStep('brand');
    else if (currentStep === 'voice') setCurrentStep('persona');
    else if (currentStep === 'features') setCurrentStep('voice');
  };

  const toggleFeature = (id: string) => {
    setSelectedFeatures(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return setError("Session expired. Please sign in.");
    
    setLoading(true);
    setError("");
    try {
      await auth.addVoiceModule(
        moduleName.trim(), 
        questions.filter(q => q.trim()), 
        systemPrompt.trim(), 
        ttsProvider, 
        selectedLanguage, 
        selectedVoice
      );
      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        onClose();
        if (typeof window !== 'undefined') window.location.href = '/modules'; 
      }, 1500);
    } catch (error) {
      setError("Deployment failed. Try again.");
      setLoading(false);
    }
  };

  const steps = [
    { id: 'brand', label: 'Identity', desc: 'Name your agent', icon: <Briefcase className="w-5 h-5" /> },
    { id: 'persona', label: 'Persona', desc: 'Behavior & scripts', icon: <BrainCircuit className="w-5 h-5" /> },
    { id: 'voice', label: 'Voice', desc: 'Synthesis engine', icon: <Waves className="w-5 h-5" /> },
    { id: 'features', label: 'Skills', desc: 'Capabilities', icon: <Zap className="w-5 h-5" /> }
  ];

  const currentIdx = ['brand', 'persona', 'voice', 'features'].indexOf(currentStep);

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-4xl" className="p-0 border-white/[0.1] shadow-2xl">
      <div className="flex flex-col md:flex-row h-[550px] bg-zinc-950 rounded-lg overflow-hidden">
        
        {/* Left Sidebar - Step Navigation */}
        <div className="hidden md:flex w-[260px] bg-zinc-900/50 border-r border-white/[0.05] p-6 flex-col relative overflow-hidden">
          
          <div className="mb-12 relative z-10">
            <h2 className="text-xl font-bold text-white mb-2 tracking-tight">Configure Agent</h2>
            <p className="text-zinc-500 text-xs">Design your AI persona in four simple steps.</p>
          </div>

          <div className="space-y-8 relative z-10">
            {steps.map((step, i) => {
              const isActive = currentStep === step.id;
              const isPassed = i < currentIdx;
              
              return (
                <div key={step.id} className="flex gap-4 relative">
                  {/* Vertical connector line */}
                  {i < steps.length - 1 && (
                    <div className="absolute left-[20px] top-[40px] w-px h-[40px] bg-zinc-800">
                      <div 
                        className="w-full bg-blue-500 transition-all duration-500" 
                        style={{ height: isPassed ? '100%' : '0%' }}
                      />
                    </div>
                  )}
                  
                  <button
                    type="button"
                    onClick={() => { if (i < currentIdx) setCurrentStep(step.id as Step); }}
                    disabled={i >= currentIdx}
                    className="flex-shrink-0 relative focus:outline-none"
                  >
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center transition-all duration-500 border ${
                      isActive 
                        ? 'bg-white border-white text-black' 
                        : isPassed 
                          ? 'bg-zinc-800 border-zinc-700 text-white' 
                          : 'bg-transparent border-white/10 text-zinc-600'
                    }`}>
                      {step.icon}
                    </div>
                  </button>
                  
                  <div className="flex flex-col justify-center">
                    <span className={`text-[13px] font-medium tracking-wide transition-colors ${
                      isActive ? 'text-white' : isPassed ? 'text-zinc-300' : 'text-zinc-600'
                    }`}>
                      {step.label}
                    </span>
                    <span className={`text-[10px] uppercase tracking-wider font-medium mt-0.5 ${
                      isActive ? 'text-zinc-400' : 'text-zinc-600'
                    }`}>
                      {step.desc}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Content Area */}
        <div className="flex-1 flex flex-col relative bg-zinc-950">
          
          <div className="flex-1 overflow-y-auto p-8 md:p-12 custom-scrollbar">
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <p className="text-red-400 text-xs font-semibold">{error}</p>
              </div>
            )}

            {currentStep === 'brand' && (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div className="mb-8">
                  <h3 className="text-2xl font-bold text-white mb-2">What should we call your agent?</h3>
                  <p className="text-zinc-400 text-sm">This is how the agent will be identified in your dashboard and analytics.</p>
                </div>
                
                <div className="space-y-3 relative group">
                  <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-widest block">Agent Name</label>
                  <input
                    autoFocus
                    type="text"
                    value={moduleName}
                    onChange={(e) => setModuleName(e.target.value)}
                    className="w-full bg-zinc-900/50 border border-white/[0.1] rounded-md px-4 py-3 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-all text-sm font-medium"
                    placeholder="e.g. Sales Qualifier Bot"
                  />
                </div>
              </div>
            )}

            {currentStep === 'persona' && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">System Prompt</h3>
                    <p className="text-zinc-400 text-xs">Define the agent's behavior, rules, and background context.</p>
                  </div>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    rows={5}
                    className="w-full bg-zinc-900/50 border border-white/[0.1] p-4 rounded-md text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-all text-[13px] resize-none leading-relaxed font-medium custom-scrollbar"
                    placeholder="You are Alex, an enthusiastic sales rep. Your goal is to qualify leads by asking about their budget and timeline. Be concise and professional."
                  />
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">Questionnaire Script</h3>
                      <p className="text-zinc-400 text-xs">The specific questions your agent must ask the user.</p>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {questions.map((q, i) => (
                      <div key={i} className="flex gap-3 group items-center animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-zinc-900 border border-white/10 flex items-center justify-center text-[10px] text-zinc-500 font-bold">
                          {i + 1}
                        </div>
                        <div className="relative flex-1">
                          <input
                            type="text"
                            value={q}
                            onChange={(e) => updateQuestion(i, e.target.value)}
                            className="w-full bg-zinc-900/50 border border-white/[0.1] rounded-md pl-4 pr-10 py-2.5 text-zinc-200 placeholder-zinc-600 text-[13px] focus:outline-none focus:border-zinc-500 transition-all"
                            placeholder="e.g. What is your estimated timeline for this project?"
                          />
                          <button
                            type="button"
                            onClick={() => translateToHindi(i)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-blue-400 hover:bg-blue-500/10 transition-all p-1.5 rounded-lg"
                            title="Translate to Hindi"
                          >
                            {translating === i ? <Loader2 className="w-4 h-4 animate-spin" /> : <Languages className="w-4 h-4" />}
                          </button>
                        </div>
                        {questions.length > 1 && (
                          <button 
                            onClick={() => removeQuestion(i)} 
                            className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-all opacity-0 group-hover:opacity-100"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    
                    <button 
                      type="button" 
                      onClick={addQuestion} 
                      className="ml-9 mt-2 text-zinc-300 hover:text-white text-[12px] font-medium transition-colors flex items-center gap-1.5"
                    >
                      <div className="w-4 h-4 rounded bg-white/10 flex items-center justify-center">
                        <span className="text-sm leading-none mb-0.5">+</span>
                      </div>
                      Add Question
                    </button>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 'voice' && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">Synthesis Engine</h3>
                    <p className="text-zinc-400 text-xs">Choose the provider that powers your agent's voice.</p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { id: 'sarvam', label: 'Sarvam AI', desc: 'Premium Regional Dialects', icon: Waves },
                      { id: 'cartesia', label: 'Cartesia AI', desc: 'Sonic Realism', icon: Waves },
                      { id: 'deepgram', label: 'Deepgram Aura', desc: 'Fast Conversational', icon: Zap },
                      { id: 'google', label: 'Google Cloud', desc: 'Standard Voices', icon: Waves },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleProviderChange(p.id as any)}
                        className={`flex items-center gap-4 p-3 rounded-md border transition-all duration-300 text-left group ${
                          ttsProvider === p.id 
                            ? 'bg-zinc-800 border-zinc-500' 
                            : 'bg-zinc-900/40 border-white/[0.1] hover:bg-zinc-900/80'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-md flex items-center justify-center transition-colors flex-shrink-0 ${ttsProvider === p.id ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-500'}`}>
                          <p.icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className={`text-[13px] font-medium tracking-wide transition-colors ${ttsProvider === p.id ? 'text-white' : 'text-zinc-300 group-hover:text-white'}`}>{p.label}</p>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mt-0.5">{p.desc}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Language</label>
                    <div className="relative">
                      <select
                        value={selectedLanguage}
                        onChange={(e) => setSelectedLanguage(e.target.value)}
                        className="w-full h-10 pl-3 pr-8 bg-zinc-900/50 border border-white/[0.1] rounded-md text-zinc-200 focus:outline-none focus:border-zinc-500 text-[13px] cursor-pointer appearance-none"
                      >
                        {currentLanguages.map(l => (
                          <option key={l.code} value={l.code} className="bg-zinc-900">{l.label}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-zinc-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Voice Model</label>
                    <div className="relative">
                      <select
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        className="w-full h-10 pl-3 pr-8 bg-zinc-900/50 border border-white/[0.1] rounded-md text-zinc-200 focus:outline-none focus:border-zinc-500 text-[13px] cursor-pointer appearance-none"
                      >
                        {currentVoices.map(v => (
                          <option key={v.id} value={v.id} className="bg-zinc-900">{v.label}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-zinc-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 'features' && (
              <div className="space-y-8 animate-in fade-in duration-500">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Advanced Skills</h3>
                  <p className="text-zinc-400 text-xs">Equip your agent with specialized capabilities.</p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {features.map((f) => {
                    const isSelected = selectedFeatures.includes(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleFeature(f.id)}
                        className={`p-4 rounded-md transition-all duration-300 flex items-start gap-3 border text-left group relative overflow-hidden ${
                          isSelected 
                            ? 'bg-zinc-800 border-zinc-500' 
                            : 'bg-zinc-900/40 border-white/[0.1] hover:bg-zinc-900/80'
                        }`}
                      >
                        {isSelected && <div className="absolute inset-0 bg-blue-500/5 pointer-events-none"></div>}
                        
                        <div className={`w-8 h-8 rounded-md transition-all flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-white text-black' : 'bg-zinc-900 text-zinc-500'}`}>
                          {f.icon}
                        </div>
                        <div className="min-w-0 flex-1 mt-0.5">
                          <span className={`block text-sm font-bold tracking-tight transition-colors ${isSelected ? 'text-white' : 'text-zinc-300 group-hover:text-white'}`}>{f.name}</span>
                          <span className="block text-xs text-zinc-500 mt-1 leading-relaxed font-medium">{f.desc}</span>
                        </div>
                        
                        <div className={`w-4 h-4 mt-0.5 rounded-full border flex items-center justify-center transition-colors ${
                          isSelected ? 'border-zinc-500 bg-white' : 'border-zinc-700 group-hover:border-zinc-500'
                        }`}>
                          {isSelected && <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                        </div>
                      </button>
                    );
                  })}
                </div>
                
                <div className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-white/[0.04] rounded-md">
                  <div className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse" />
                  <p className="text-xs text-zinc-400 font-medium">Intelligent Analytics Engine is automatically linked to all agents.</p>
                </div>
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="px-8 py-5 border-t border-white/[0.05] bg-zinc-950 flex items-center justify-between">
            <button
              onClick={prevStep}
              className={`px-4 h-9 rounded-md font-medium text-[13px] transition-all ${
                currentStep === 'brand' 
                  ? 'opacity-0 pointer-events-none' 
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              Back
            </button>
            
            <button
              onClick={currentStep === 'features' ? handleSubmit : nextStep}
              disabled={loading}
              className={`min-w-[120px] h-9 px-6 rounded-md font-medium text-[13px] transition-all flex items-center justify-center ${
                loading 
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                  : currentStep === 'features'
                    ? 'bg-white hover:bg-zinc-200 text-black active:scale-95'
                    : 'bg-white hover:bg-zinc-200 text-black active:scale-95'
              }`}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : success ? (
                'Deployed'
              ) : currentStep === 'features' ? (
                'Deploy Agent'
              ) : (
                'Next Step'
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );};

export default CreateModule;
 