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

import { GOOGLE_LANGUAGES, GOOGLE_VOICES, SARVAM_LANGUAGES, SARVAM_VOICES } from "../lib/ttsConfig";

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

  const [ttsProvider, setTtsProvider] = useState<"google" | "sarvam">("sarvam");
  const [selectedLanguage, setSelectedLanguage] = useState("hi-IN");
  const [selectedVoice, setSelectedVoice] = useState("anushka");

  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const features = [
    { id: 'sales', name: 'Deal Closer', icon: <TrendingUp className="w-4 h-4" />, desc: 'Negotiation & Discount logic' },
    { id: 'appointments', name: 'Medical/Clinic', icon: <Calendar className="w-4 h-4" />, desc: 'Scheduling & Rescheduling' },
    { id: 'leads', name: 'Real Estate Qualifier', icon: <Search className="w-4 h-4" />, desc: 'Qualification & Intent tiering' },
    { id: 'recovery', name: 'E-commerce Recovery', icon: <ShieldCheck className="w-4 h-4" />, desc: 'Trust & Friction resolution' }
  ];

  const handleProviderChange = (provider: "google" | "sarvam") => {
    setTtsProvider(provider);
    if (provider === "google") {
      setSelectedLanguage("en-IN");
      setSelectedVoice("NEERJA");
    } else {
      setSelectedLanguage("hi-IN");
      setSelectedVoice("anushka");
    }
  };

  const currentLanguages = ttsProvider === "google" ? GOOGLE_LANGUAGES : SARVAM_LANGUAGES;
  const currentVoices = ttsProvider === "google" ? GOOGLE_VOICES[selectedLanguage] || [] : SARVAM_VOICES[selectedLanguage] || [];

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
    if (currentStep === 'brand' && !moduleName.trim()) {
      setError("Please give your agent a name");
      return false;
    }
    if (currentStep === 'persona' && questions.filter(q => q.trim()).length === 0) {
      setError("Add at least one question for your agent to ask");
      return false;
    }
    return true;
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

  const StepIndicator = () => {
    const steps = [
      { id: 'brand', label: 'Brand', icon: <Briefcase className="w-4 h-4" /> },
      { id: 'persona', label: 'Persona', icon: <BrainCircuit className="w-4 h-4" /> },
      { id: 'voice', label: 'Voice', icon: <Waves className="w-4 h-4" /> },
      { id: 'features', label: 'Skills', icon: <Zap className="w-4 h-4" /> }
    ];
    const currentIdx = ['brand', 'persona', 'voice', 'features'].indexOf(currentStep);

    return (
      <div className="w-full flex items-center justify-between px-2 mb-12 relative">
        {/* Connector Line in Background */}
        <div className="absolute left-6 right-6 top-[20px] h-[2px] bg-zinc-800/80 -z-10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-500 ease-out" 
            style={{ width: `${(currentIdx / (steps.length - 1)) * 100}%` }}
          />
        </div>

        {steps.map((step, i) => {
          const isActive = currentStep === step.id;
          const isPassed = i < currentIdx;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => {
                if (i < currentIdx) setCurrentStep(step.id as Step);
              }}
              disabled={i >= currentIdx}
              className="flex flex-col items-center gap-2 group cursor-pointer focus:outline-none disabled:cursor-not-allowed"
            >
              <div 
                className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-500 ${
                  isActive 
                    ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_20px_rgba(59,130,246,0.35)] scale-110' 
                    : isPassed 
                      ? 'bg-blue-950/60 border-blue-500/40 text-blue-400' 
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500 group-hover:border-zinc-700 group-hover:text-zinc-400'
                }`}
              >
                {step.icon}
              </div>
              <span 
                className={`text-[10px] font-bold uppercase tracking-wider transition-colors duration-300 ${
                  isActive ? 'text-blue-400' : isPassed ? 'text-blue-500/80' : 'text-zinc-500'
                }`}
              >
                {step.label}
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-xl" className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-black border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)]">
      <div className="relative p-6 sm:p-10">
        <div className="mb-10 text-center">
          <h2 className="text-xl font-semibold text-white tracking-tight mb-1.5">
            Configure Agent
          </h2>
          <p className="text-zinc-500 text-[10px] font-bold tracking-[0.2em] opacity-80 uppercase">PHASE: {currentStep}</p>
        </div>

        <StepIndicator />

        <div className="mt-12 min-h-[220px]">
          {error && (
            <div className="mb-6 py-2 text-red-500 text-[10px] font-bold uppercase tracking-widest text-center animate-pulse">
              {error}
            </div>
          )}

          {currentStep === 'brand' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500 flex flex-col items-center">
              <div className="mb-2 p-5 rounded-[2rem] bg-blue-500/10 border border-blue-500/20 text-blue-400 shadow-[0_0_30px_rgba(59,130,246,0.05)]">
                <Briefcase className="w-10 h-10" />
              </div>
              
              <div className="w-full relative group">
                <input
                  autoFocus
                  type="text"
                  value={moduleName}
                  onChange={(e) => setModuleName(e.target.value)}
                  className="w-full bg-zinc-900/60 border border-white/5 rounded-2xl px-6 py-4 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all text-lg font-semibold tracking-tight text-center"
                  placeholder="e.g. Athena Support Bot"
                />
              </div>
              
              <p className="text-zinc-500 text-[10px] text-center tracking-[0.15em] uppercase font-bold opacity-80 leading-normal max-w-xs">
                Identify your agent for business reporting and call logs.
              </p>
            </div>
          )}

          {currentStep === 'persona' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Logic & Behavioral Instructions</p>
                </div>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={3}
                  className="w-full bg-zinc-950/45 border border-white/5 p-5 rounded-2xl text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all text-sm resize-none tracking-tight leading-relaxed font-medium"
                  placeholder="Define your agent's personality, goal, guidelines, and context. (e.g. 'You are Neerja, a helpful customer service representative at Fortis Hospital. Be extremely polite...')"
                />
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Qualification Questionnaire</span>
                  <button 
                    type="button" 
                    onClick={addQuestion} 
                    className="text-blue-400 hover:text-blue-300 text-[10px] font-bold tracking-wider transition-colors uppercase flex items-center gap-1"
                  >
                    <span>+ Add Question</span>
                  </button>
                </div>
                <div className="max-h-56 overflow-y-auto pr-1 flex flex-col gap-3">
                  {questions.map((q, i) => (
                    <div key={i} className="flex gap-3 group items-center animate-in fade-in slide-in-from-bottom-1 duration-300">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={q}
                          onChange={(e) => updateQuestion(i, e.target.value)}
                          className="w-full bg-zinc-950/30 border border-white/5 rounded-xl pl-4 pr-10 py-3 text-white placeholder-zinc-650 text-xs focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all font-semibold"
                          placeholder={`Question ${i + 1} (e.g., Are you currently experiencing any symptoms?)`}
                        />
                        <button
                          type="button"
                          onClick={() => translateToHindi(i)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-550 hover:text-blue-400 transition-colors p-1 rounded-md hover:bg-white/5"
                          title="Translate to Hindi"
                        >
                          {translating === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      {questions.length > 1 && (
                        <button 
                          onClick={() => removeQuestion(i)} 
                          className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep === 'voice' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex justify-center gap-8">
                {[
                  { id: 'sarvam', label: 'Sarvam AI', desc: 'Premium Regional Dialects', icon: Waves },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleProviderChange(p.id as any)}
                    className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all duration-300 w-44 group ${
                      ttsProvider === p.id 
                        ? 'bg-blue-600/5 border-blue-500/50 shadow-[0_0_25px_rgba(59,130,246,0.1)]' 
                        : 'bg-zinc-950/40 border-white/5 text-zinc-550 hover:border-zinc-800 hover:text-zinc-400'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500 ${ttsProvider === p.id ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-500'}`}>
                      <p.icon className="w-5 h-5" />
                    </div>
                    <div className="text-center">
                      <p className={`text-xs font-bold tracking-wide transition-colors ${ttsProvider === p.id ? 'text-blue-400' : 'text-zinc-400 group-hover:text-zinc-300'}`}>{p.label}</p>
                      <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider mt-1 opacity-70 leading-none">{p.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-6 px-2">
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Primary Language</p>
                  <div className="relative w-full">
                    <select
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      className="w-full h-10 pl-3 pr-8 bg-zinc-900 border border-white/5 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-xs font-semibold cursor-pointer appearance-none"
                    >
                      {currentLanguages.map(l => (
                        <option key={l.code} value={l.code} className="bg-zinc-900 font-semibold">{l.label}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-zinc-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Voice Persona</p>
                  <div className="relative w-full">
                    <select
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="w-full h-10 pl-3 pr-8 bg-zinc-900 border border-white/5 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-xs font-semibold cursor-pointer appearance-none"
                    >
                      {currentVoices.map(v => (
                        <option key={v.id} value={v.id} className="bg-zinc-900 font-semibold">{v.label}</option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-zinc-400">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'features' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="grid grid-cols-2 gap-4">
                {features.map((f) => {
                  const isSelected = selectedFeatures.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleFeature(f.id)}
                      className={`p-4 rounded-2xl transition-all duration-300 flex items-start gap-4 border text-left group ${
                        isSelected 
                          ? 'bg-blue-600/5 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.08)]' 
                          : 'bg-zinc-950/40 border-white/5 hover:border-zinc-800 hover:bg-zinc-900/40'
                      }`}
                    >
                      <div className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-500'}`}>
                        {f.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className={`block text-xs font-bold tracking-tight transition-colors ${isSelected ? 'text-blue-400' : 'text-zinc-300 group-hover:text-white'}`}>{f.name}</span>
                        <span className="block text-[10px] text-zinc-500 mt-1 leading-normal font-medium">{f.desc}</span>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 border border-blue-400/30">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-2 opacity-30 mt-4">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <p className="text-[10px] text-zinc-400 tracking-[0.15em] font-bold uppercase italic">Intelligent Analytics Engine Auto-Linked</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-16 flex items-center justify-end gap-4">
          {currentStep !== 'brand' && (
            <button
              onClick={prevStep}
              className="text-zinc-500 hover:text-white px-2 py-2 transition-all font-bold text-[10px] tracking-[0.2em] uppercase"
            >
              Back
            </button>
          )}
          
          <button
            onClick={currentStep === 'features' ? handleSubmit : nextStep}
            disabled={loading}
            className={`min-w-[120px] py-3.5 px-6 rounded-xl transition-all duration-500 font-bold text-[10px] tracking-[0.2em] uppercase shadow-lg ${
              loading 
                ? 'bg-zinc-900 text-zinc-700' 
                : currentStep === 'features'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/20 active:scale-95'
                  : 'bg-white text-black hover:bg-zinc-200 active:scale-95'
            }`}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : success ? (
              'Deployed!'
            ) : currentStep === 'features' ? (
              'Deploy'
            ) : (
              'Next'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default CreateModule;
 