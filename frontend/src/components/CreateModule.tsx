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
  const [translating, setTranslating] = useState<number | null>(null);

  const [ttsProvider, setTtsProvider] = useState<"google" | "sarvam">("google");
  const [selectedLanguage, setSelectedLanguage] = useState("en-IN");
  const [selectedVoice, setSelectedVoice] = useState("NEERJA");

  // Agent Skills / Features (New)
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
    try {
      await auth.addVoiceModule(
        moduleName.trim(), 
        questions.filter(q => q.trim()), 
        systemPrompt.trim(), 
        ttsProvider, 
        selectedLanguage, 
        selectedVoice
      );
      // setSuccess("Agent deployed successfully!"); // Removed unused success message for cleaner UX
      setTimeout(() => {
        onClose();
        // window.location.reload(); // Removed reload for smoother UX, usually handled by parent refresh logic
        if (typeof window !== 'undefined') window.location.href = '/modules'; 
      }, 1500);
    } catch (error) {
      setError("Deployment failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-center mb-10 gap-16">
      {[
        { id: 'brand', icon: <Briefcase className="w-3.5 h-3.5" /> },
        { id: 'persona', icon: <BrainCircuit className="w-3.5 h-3.5" /> },
        { id: 'voice', icon: <Waves className="w-3.5 h-3.5" /> },
        { id: 'features', icon: <Zap className="w-3.5 h-3.5" /> }
      ].map((step, i) => (
        <div key={step.id} className="relative flex flex-col items-center">
          <div className={`flex flex-col items-center gap-2 group cursor-pointer transition-all duration-300 ${currentStep === step.id ? 'opacity-100' : 'opacity-20 hover:opacity-40'}`}
               onClick={() => {
                 const stepIdx = ['brand', 'persona', 'voice', 'features'].indexOf(currentStep);
                 if (i < stepIdx) setCurrentStep(step.id as Step);
               }}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${currentStep === step.id ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'bg-zinc-900 text-zinc-400'}`}>
              {step.icon}
            </div>
            <span className={`text-[9px] uppercase tracking-[0.2em] font-bold absolute -bottom-6 transition-all duration-300 ${currentStep === step.id ? 'text-blue-500 translate-y-0 opacity-100' : 'text-zinc-500 translate-y-1 opacity-0'}`}>{step.id}</span>
          </div>
          {i < 3 && (
            <div className="absolute left-[calc(100%+8px)] top-5 w-8 h-[1px] bg-zinc-800" />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} maxWidth="max-w-xl" className="bg-zinc-900/80 backdrop-blur-2xl">
      <div className="relative p-6 md:p-12">
        <div className="mb-10 text-center">
          <h2 className="text-xl font-medium text-white tracking-tight mb-1.5">
            Configure Agent
          </h2>
          <p className="text-zinc-400 text-[10px] font-bold tracking-[0.2em] opacity-80 uppercase">PHASE: {currentStep}</p>
        </div>

        <StepIndicator />

        <div className="mt-12 min-h-[220px]">
          {error && (
            <div className="mb-6 py-2 text-red-500 text-[10px] font-bold uppercase tracking-widest text-center animate-pulse">
              {error}
            </div>
          )}

          {currentStep === 'brand' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="relative group">
                <input
                  autoFocus
                  type="text"
                  value={moduleName}
                  onChange={(e) => setModuleName(e.target.value)}
                  className="w-full bg-transparent border-b border-zinc-900 py-4 text-white placeholder-zinc-800 focus:outline-none focus:border-blue-500/60 transition-all text-xl font-light tracking-tight text-center"
                  placeholder="Enter Agent Name..."
                />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0 h-[1px] bg-blue-500 transition-all duration-500 group-focus-within:w-full opacity-40" />
              </div>
              <p className="text-zinc-600 text-[10px] text-center tracking-widest uppercase font-medium opacity-40">
                Identify your agent for business reporting.
              </p>
            </div>
          )}

          {currentStep === 'persona' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="space-y-4">
                <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] ml-2 opacity-80">Logic & Behavioral Prompt</p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={2}
                  className="w-full bg-zinc-900/10 border border-zinc-900/50 p-6 rounded-[2rem] text-white placeholder-zinc-800 focus:outline-none focus:border-blue-500/30 transition-all text-sm resize-none tracking-tight leading-relaxed"
                  placeholder='Describe how the AI should behave...'
                />
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between px-3">
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] opacity-80">Survey Questions</span>
                  <button type="button" onClick={addQuestion} className="text-blue-500/80 hover:text-blue-400 text-[9px] font-bold tracking-widest transition-colors uppercase">Add +</button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {questions.map((q, i) => (
                    <div key={i} className="flex gap-3 group items-center">
                      <div className="relative flex-1 group">
                        <input
                          type="text"
                          value={q}
                          onChange={(e) => updateQuestion(i, e.target.value)}
                          className="w-full bg-transparent border-b border-zinc-900/50 py-3 pr-8 text-white placeholder-zinc-800 text-xs focus:outline-none focus:border-blue-500/60 transition-all font-medium"
                          placeholder={`Enter question ${i + 1}`}
                        />
                        <button
                          type="button"
                          onClick={() => translateToHindi(i)}
                          className="absolute right-0 top-1/2 -translate-y-1/2 text-zinc-600 group-hover:text-blue-400 transition-colors"
                        >
                          {translating === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                        </button>
                      </div>
                      {questions.length > 1 && (
                        <button onClick={() => removeQuestion(i)} className="p-1.5 text-zinc-800 hover:text-red-500/40 transition-all">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStep === 'voice' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="flex justify-center gap-12">
                {[
                  { id: 'google', label: 'Google', desc: 'Ultra-Fast', icon: Zap },
                  { id: 'sarvam', label: 'Sarvam', desc: 'Regional', icon: Waves },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleProviderChange(p.id as any)}
                    className="flex flex-col items-center gap-3 group"
                  >
                    <div className={`w-14 h-14 rounded-[1.5rem] flex items-center justify-center transition-all duration-500 border ${ttsProvider === p.id ? 'bg-blue-600 border-blue-500 text-white shadow-xl shadow-blue-500/40' : 'bg-zinc-950 border-zinc-900 text-zinc-600 hover:border-zinc-800 hover:text-zinc-400'}`}>
                      <p.icon className="w-5 h-5" />
                    </div>
                    <div className="text-center">
                      <p className={`text-[10px] font-bold tracking-widest uppercase transition-colors ${ttsProvider === p.id ? 'text-blue-400' : 'text-zinc-500'}`}>{p.label}</p>
                      <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-tighter mt-1 opacity-60 leading-none">{p.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-10 px-4">
                <div className="space-y-4">
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] ml-0.5 opacity-80">Primary Language</p>
                  <div className="relative group">
                    <select
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      className="w-full bg-transparent border-b border-zinc-900 pb-3 text-white text-sm appearance-none cursor-pointer focus:outline-none focus:border-blue-500/60 transition-all font-medium pr-8"
                    >
                      {currentLanguages.map(l => (
                        <option key={l.code} value={l.code} className="bg-zinc-950">{l.label}</option>
                      ))}
                    </select>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-700 group-hover:text-zinc-500 transition-colors">
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-[0.2em] ml-0.5 opacity-80">Voice Persona</p>
                  <div className="relative group">
                    <select
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="w-full bg-transparent border-b border-zinc-900 pb-3 text-white text-sm appearance-none cursor-pointer focus:outline-none focus:border-blue-500/60 transition-all font-medium pr-8"
                    >
                      {currentVoices.map(v => (
                        <option key={v.id} value={v.id} className="bg-zinc-950">{v.label}</option>
                      ))}
                    </select>
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-700 group-hover:text-zinc-500 transition-colors">
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'features' && (
            <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="grid grid-cols-2 gap-4">
                {features.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => toggleFeature(f.id)}
                    className={`p-4 rounded-[1.8rem] transition-all duration-300 flex items-center gap-4 border group ${selectedFeatures.includes(f.id) ? 'bg-blue-600/5 border-blue-500/50' : 'bg-transparent border-zinc-900 hover:border-zinc-800'}`}
                  >
                    <div className={`p-2.5 rounded-2xl transition-all ${selectedFeatures.includes(f.id) ? 'bg-blue-600 text-white' : 'bg-zinc-900 text-zinc-600'}`}>
                      {f.icon}
                    </div>
                    <span className={`text-[11px] font-bold tracking-tight transition-colors ${selectedFeatures.includes(f.id) ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-400'}`}>{f.name}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-center gap-2.5 opacity-30">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                <p className="text-[10px] text-zinc-400 tracking-[0.1em] font-medium uppercase italic">Intelligent Analytics Linked</p>
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
            className={`min-w-[120px] py-3 px-6 rounded-full transition-all duration-500 font-bold text-[10px] tracking-[0.2em] uppercase shadow-lg ${loading ? 'bg-zinc-900 text-zinc-700' : 'bg-white text-black hover:bg-zinc-200 active:scale-95'}`}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
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
 