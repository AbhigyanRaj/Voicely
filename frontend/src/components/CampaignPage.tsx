import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as auth from '../lib/auth';
import ContactUploader from './ContactUploader';
import { PhoneCall, Activity, Zap, CheckCircle2 } from 'lucide-react';

const CampaignPage: React.FC = () => {
  const { user } = useAuth();
  const [userModules, setUserModules] = useState<any[]>([]);
  const [selectedModule, setSelectedModule] = useState<any>(null);
  
  // Voice & TTS State
  const [ttsProvider, setTtsProvider] = useState<'cartesia' | 'sarvam'>('cartesia');
  const [selectedVoice, setSelectedVoice] = useState('47c38ca4-5f35-497b-b1a3-415245fb35e1');
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [selectedModel, setSelectedModel] = useState('gemini');

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
    loadUserModules();
  }, [loadUserModules]);

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#050505] pt-24 pb-12 px-4 sm:px-6">
      {/* Rich Background Elements */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-blue-500/[0.03] rounded-full blur-[120px] pointer-events-none"></div>
      
      <div className="max-w-6xl mx-auto w-full relative z-10">
        <div className="mb-6 flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-bottom-2 duration-700">
          <h1 className="text-xl font-bold text-white tracking-tight mb-1.5">Launch Campaigns</h1>
          <p className="text-zinc-500 text-xs max-w-sm">
            Select an agent and upload your contacts to instantly start a calling campaign.
          </p>
        </div>

        <div className="max-w-md mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          <div className="bg-[#09090b] border border-white/[0.08] rounded-2xl p-6 relative shadow-2xl">
            {/* Subtle top glow */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            
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
              onSubmit={(contacts) => {
                console.log('Campaign started for:', contacts);
                // Optional: Show success state or redirect
              }}
              onClose={() => {}}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignPage;
