import React, { useState, useRef, useEffect } from "react";
import * as auth from "../lib/auth";
import { api } from "../lib/api";
import { getProviders } from "../lib/settings";
import type { ProviderCredential } from "../lib/settings";

interface Contact {
  name: string;
  phone: string;
  selected: boolean;
}

interface ContactUploaderProps {
  onSubmit: (contacts: { name: string; phone: string }[]) => void;
  onClose: () => void;
  selectedModule?: any;
  userModules?: any[];
}

const CSV_TEMPLATE = "name,phone\nAbhigyan Raj,9234567890\nSandeep Mehta,9876543210";

const ContactUploader: React.FC<ContactUploaderProps> = ({ 
  onSubmit, 
  onClose, 
  selectedModule: initialModule, 
  userModules = []
}) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [calling, setCalling] = useState(false);
  
  const [selectedModule, setSelectedModule] = useState<any>(initialModule || null);
  const [moduleDropdownOpen, setModuleDropdownOpen] = useState(false);
  const moduleDropdownRef = useRef<HTMLDivElement | null>(null);
  const [userProviders, setUserProviders] = useState<ProviderCredential[]>([]);

  useEffect(() => {
    getProviders().then(setUserProviders).catch(console.error);
  }, []);

  const configuredProviderNames = userProviders.map(p => p.providerName.toLowerCase());
  
  const requiredProviders = [
    { id: 'twilio', name: 'Twilio (Calls)' }
  ];

  if (selectedModule) {
    const ttsProv = selectedModule.ttsProvider || 'google';
    const ttsName = ttsProv.charAt(0).toUpperCase() + ttsProv.slice(1);
    requiredProviders.push({ id: 'deepgram', name: 'Deepgram (STT)' });
    requiredProviders.push({ id: 'gemini', name: 'Gemini or OpenAI (LLM)' });
    requiredProviders.push({ id: ttsProv, name: `${ttsName} (TTS)` });
  }

  const missingProviders = requiredProviders.filter(p => {
    if (p.id === 'gemini') {
      return !configuredProviderNames.includes('gemini') && !configuredProviderNames.includes('openai');
    }
    if (p.id === 'deepgram') {
      return !configuredProviderNames.includes('deepgram');
    }
    return !configuredProviderNames.includes(p.id);
  });
  
  const hasAllKeys = selectedModule ? missingProviders.length === 0 : false;

  // Close module dropdown on outside click or ESC
  useEffect(() => {
    if (!moduleDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (moduleDropdownRef.current && !moduleDropdownRef.current.contains(e.target as Node)) {
        setModuleDropdownOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModuleDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [moduleDropdownOpen]);

  const parseCSV = (csv: string) => {
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    const nameIdx = headers.indexOf("name");
    const phoneIdx = headers.indexOf("phone");
    if (nameIdx === -1 || phoneIdx === -1) return [];
    return lines.slice(1).map(line => {
      const cols = line.split(",");
      return {
        name: cols[nameIdx]?.trim() || "",
        phone: cols[phoneIdx]?.trim() || "",
        selected: true,
      };
    }).filter(c => c.phone);
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        setError("Invalid CSV. Use columns: name, phone");
        setContacts([]);
      } else {
        setContacts(parsed);
        setError("");
        setSuccess("CSV uploaded successfully!");
        setTimeout(() => setSuccess(""), 2000);
      }
    };
    reader.readAsText(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
  };

  const makeCallToBackend = async (contact: { name: string; phone: string }) => {
    try {
      const token = auth.getStoredToken();
      if (!token) {
        setError('Authentication required.');
        return false;
      }
      const ttsProv = selectedModule?.ttsProvider || 'google';
      const result = await api.initiateCall(
        token,
        selectedModule?.id || 'simple-module',
        contact.phone,
        contact.name,
        selectedModule?.selectedVoice || 'default',
        selectedModule?.selectedLanguage || 'en-IN',
        ttsProv
      );

      if (result.success) {
        return true;
      } else {
        setError(`Call failed: ${result.message || result.error}`);
        return false;
      }
    } catch (error: any) {
      setError(`Call failed: ${error.message || 'Unknown error'}`);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setCalling(true);

    try {
      let contactsToCall: { name: string; phone: string }[] = [];

      if (!hasAllKeys) {
        setError("You must configure all required API keys in Settings first.");
        setCalling(false);
        return;
      }

      if (contacts.length > 0) {
        const selected = contacts.filter(c => c.selected);
        if (selected.length === 0) {
          setError("Select at least one contact");
          setCalling(false);
          return;
        }
        contactsToCall = selected.map(({ name, phone }) => ({ name, phone }));
      } else {
        if (!manualName || !manualPhone) {
          setError("Enter name and phone");
          setCalling(false);
          return;
        }
        contactsToCall = [{ name: manualName, phone: manualPhone }];
      }

      setSuccess(`Initiating calls to ${contactsToCall.length} contact(s)...`);

      let successCount = 0;
      for (const contact of contactsToCall) {
        const success = await makeCallToBackend(contact);
        if (success) {
          successCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (successCount > 0) {
        setSuccess(`Successfully initiated ${successCount} call(s)!`);
        setTimeout(() => {
          setSuccess("");
          onSubmit(contactsToCall);
          onClose();
        }, 2000);
      } else {
        setError("Failed to initiate any calls. Please try again.");
      }
    } catch (error) {
      setError("An error occurred while making calls.");
    } finally {
      setCalling(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full max-w-md mx-auto sm:p-0 font-sans">
      
      {/* 1. Voice Agent Selection */}
      <div className="flex flex-col gap-2 relative z-50" ref={moduleDropdownRef}> 
        <label className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">Voice Agent</label>
        <button
          type="button"
          className="flex items-center justify-between w-full rounded-md border border-white/[0.1] bg-zinc-800 px-3 py-2 text-[13px] text-white focus:outline-none hover:bg-zinc-700 transition-colors"
          onClick={() => setModuleDropdownOpen((open) => !open)}
        >
          {selectedModule ? (
            <div className="flex flex-col text-left">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span className="font-semibold tracking-tight">{selectedModule.name}</span>
              </span>
              <span className="text-[10px] text-zinc-500 mt-1 pl-4 uppercase tracking-wider">
                Voice: {selectedModule.selectedVoice || 'Default'} ({selectedModule.ttsProvider || 'Google'})
              </span>
            </div>
          ) : (
            <span className="text-zinc-500 font-medium">Select a module...</span>
          )}
          <svg className={`w-4 h-4 text-zinc-500 transition-transform ${moduleDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
        {moduleDropdownOpen && (
          <ul className="absolute left-0 right-0 top-full mt-1 bg-zinc-800 border border-white/[0.1] rounded-md shadow-xl max-h-64 overflow-y-auto p-1 z-50">
            {userModules.map((module) => (
              <li
                key={module.id}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-[13px] rounded-sm transition-colors ${
                  selectedModule?.id === module.id ? 'bg-zinc-700 text-white font-semibold' : 'hover:bg-zinc-700/50 text-zinc-300'
                }`}
                onClick={() => {
                  setSelectedModule(module);
                  setModuleDropdownOpen(false);
                  setError('');
                }}
              >
                <div className="flex-1 min-w-0 truncate">{module.name}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!selectedModule && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-md p-3 text-[12px] text-orange-400 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
          <span className="font-medium">Please select a voice module to continue.</span>
        </div>
      )}

      {/* 2. CSV / Contacts Upload */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <label className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">Audience Data</label>
          <a href={`data:text/csv;charset=utf-8,\${encodeURIComponent(CSV_TEMPLATE)}`} download="template.csv" className="text-[11px] text-zinc-400 hover:text-white transition-colors font-medium">Download CSV Template</a>
        </div>
        
        <div onClick={() => fileInputRef.current?.click()} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} className={`group rounded-md border border-dashed ${dragActive ? "border-zinc-400 bg-zinc-700/50" : "border-white/[0.15] bg-transparent hover:border-white/[0.3] hover:bg-zinc-800/30"} p-4 text-center cursor-pointer transition-all w-full flex flex-col items-center justify-center gap-2`}>
          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          <span className="text-[12px] text-zinc-400 font-medium group-hover:text-zinc-300">Click or drag CSV here</span>
        </div>
        
        {contacts.length === 0 && (
          <div className="flex items-center gap-3 mt-1 px-1">
            <div className="h-px flex-1 bg-white/[0.04]"></div>
            <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Or Enter Manually</span>
            <div className="h-px flex-1 bg-white/[0.04]"></div>
          </div>
        )}
        
        {contacts.length === 0 && (
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="Name" value={manualName} onChange={e => setManualName(e.target.value)} className="rounded-md border border-white/[0.1] px-3 h-9 text-[12px] focus:outline-none focus:border-zinc-400 bg-zinc-800/50 text-white placeholder-zinc-500 font-medium w-full transition-colors" />
            <input type="tel" placeholder="Phone Number" value={manualPhone} onChange={e => setManualPhone(e.target.value)} className="rounded-md border border-white/[0.1] px-3 h-9 text-[12px] focus:outline-none focus:border-zinc-400 bg-zinc-800/50 text-white placeholder-zinc-500 font-medium w-full transition-colors" />
          </div>
        )}
        
        {contacts.length > 0 && (
          <div className="bg-zinc-800/30 rounded-md p-3 border border-white/[0.08] max-h-48 overflow-y-auto">
            <div className="text-[12px] font-medium text-zinc-400 mb-3 flex items-center justify-between">
              <span>{contacts.length} Contacts Uploaded</span>
              <button type="button" onClick={() => setContacts([])} className="text-zinc-500 hover:text-white transition-colors">Clear</button>
            </div>
            <div className="space-y-2">
              {contacts.map((c, idx) => (
                <div key={idx} className="flex items-center justify-between text-[12px] px-2 py-1.5 rounded-sm bg-zinc-800">
                  <span className="text-zinc-300">{c.name}</span>
                  <span className="text-zinc-500 font-mono text-[11px]">{c.phone}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. API Checklist */}
      {selectedModule && !hasAllKeys && (
        <div className="bg-zinc-800 border border-orange-500/20 rounded-md p-4 mt-2 flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1.5 shrink-0"></span>
            <div>
              <h4 className="text-[11px] text-orange-400 font-bold uppercase tracking-widest mb-1">API Setup Required</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                You are missing required API keys for this agent ({missingProviders.map(p => p.name).join(', ')}).
              </p>
            </div>
          </div>
          <a href="/settings" className="block w-full text-center py-2 bg-white text-black hover:bg-zinc-200 rounded-md text-[11px] font-semibold transition-colors mt-1">Configure API Keys</a>
        </div>
      )}

      {/* Actions */}
      <div className="pt-2">
        <button 
          type="submit" 
          disabled={calling || !selectedModule || !hasAllKeys || (contacts.length === 0 && (!manualName || !manualPhone))}
          className="w-full h-10 rounded-md bg-white text-black font-semibold text-[13px] transition-colors hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {calling ? "Initiating Campaign..." : "Launch Campaign"}
        </button>
      </div>

      {error && <div className="text-red-400 text-[12px] text-center font-medium mt-2">{error}</div>}
      {success && <div className="text-emerald-400 text-[12px] text-center font-medium mt-2">{success}</div>}
      
    </form>
  );
};

export default ContactUploader;