import React, { useState, useEffect, useRef } from 'react';
import { 
  Trash2, 
  Copy, 
  CheckCircle2,
  ChevronDown,
  Mic,
  Activity,
  BookOpen
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDeveloperS2S } from '../hooks/useDeveloperS2S';
import { 
  getPipelineOptions, 
  generateDeveloperKey, 
  getDeveloperKeys, 
  deleteDeveloperKey
} from '../lib/developer';
import type {
  PipelineOptions,
  DeveloperKey,
  PipelineModelOption
} from '../lib/developer';
import { getApiBaseUrl } from '../lib/api';

// --- Minimal Select Component ---
interface ModelSelectProps {
  label: string;
  options: PipelineModelOption[];
  value: string;
  onChange: (val: string) => void;
}

const ModelSelect: React.FC<ModelSelectProps> = ({ label, options, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const selectedModel = options.find(o => o.id === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative mb-5" ref={dropdownRef}>
      <label className="text-xs font-medium text-zinc-400 mb-2 block px-1">{label}</label>
      <div 
        onClick={() => setOpen(!open)}
        className={`w-full bg-[#09090b] border ${open ? 'border-white/[0.15]' : 'border-white/[0.08]'} rounded-xl p-2.5 cursor-pointer hover:border-white/[0.12] transition-colors flex items-center justify-between group`}
      >
        {selectedModel ? (
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-medium tracking-wide px-1.5 py-0.5 rounded bg-zinc-800/50 text-zinc-400 uppercase">
              {selectedModel.provider}
            </span>
            <span className="font-medium text-zinc-200 text-sm">{selectedModel.name}</span>
          </div>
        ) : (
          <span className="text-zinc-500 text-sm">Select an option...</span>
        )}
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-[#09090b] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="max-h-64 overflow-y-auto p-1 custom-scrollbar">
            {options.map((option) => {
              const disabled = option.isComingSoon;
              return (
                <div 
                  key={option.id}
                  onClick={() => { if (!disabled) { onChange(option.id); setOpen(false); } }}
                  className={`px-3 py-2.5 rounded-md flex items-center justify-between transition-colors
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-zinc-900'}
                    ${value === option.id ? 'bg-zinc-800/80' : ''}
                  `}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${value === option.id ? 'text-white font-medium' : 'text-zinc-300'}`}>{option.name}</span>
                      <span className="text-[9px] uppercase font-medium text-zinc-500 tracking-wider bg-zinc-800/50 px-1 rounded">{option.provider}</span>
                      {disabled && <span className="text-[8px] uppercase font-bold text-pink-400/80 tracking-widest border border-pink-500/30 bg-pink-500/10 px-1.5 py-0.5 rounded-full ml-1">Coming Soon</span>}
                    </div>
                    <div className="text-[11px] text-zinc-500">{option.description}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 text-[10px] text-zinc-500">
                    <span className="flex items-center gap-1">{option.latency}ms</span>
                    <span className="flex items-center gap-1">{option.accuracy}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};


// --- Main Page ---
const DeveloperPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState<PipelineOptions | null>(null);
  const [keys, setKeys] = useState<DeveloperKey[]>([]);
  
  const [selectedSTT, setSelectedSTT] = useState<string>('');
  const [selectedLLM, setSelectedLLM] = useState<string>('');
  const [selectedTTS, setSelectedTTS] = useState<string>('');
  
  const [keyName, setKeyName] = useState('');
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});
  
  const [generating, setGenerating] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [testedLatency, setTestedLatency] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);

  const { isTesting, startTesting, stopTesting } = useDeveloperS2S();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [opts, userKeys] = await Promise.all([
        getPipelineOptions(),
        getDeveloperKeys()
      ]);
      setOptions(opts);
      setKeys(userKeys);
      
      if (opts.stt.length) setSelectedSTT(opts.stt[0].id);
      if (opts.llm.length) setSelectedLLM(opts.llm[0].id);
      if (opts.tts.length) setSelectedTTS(opts.tts[0].id);
      
    } catch (error) {
      console.error('Failed to load developer data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateKey = async () => {
    if (!keyName.trim()) return;
    setGenerating(true);
    setTestedLatency(null);
    try {
      const result = await generateDeveloperKey(keyName, selectedSTT, selectedLLM, selectedTTS, providerKeys);
      setGeneratedKey(result.key);
      if (result.actualLatency) {
        setTestedLatency(result.actualLatency);
      }
      setKeys([result.keyRecord, ...keys]);
      setKeyName('');
      setProviderKeys({});
    } catch (error) {
      console.error('Failed to generate key', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    try {
      await deleteDeveloperKey(id);
      setKeys(keys.filter(k => k._id !== id));
    } catch (error) {
      console.error('Failed to delete key', error);
    }
  };

  const copyToClipboard = (text: string, isCurl = false) => {
    navigator.clipboard.writeText(text);
    if (isCurl) {
      setCurlCopied(true);
      setTimeout(() => setCurlCopied(false), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading || !options) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
      </div>
    );
  }

  const currentSttModel = options.stt.find(m => m.id === selectedSTT);
  const currentLlmModel = options.llm.find(m => m.id === selectedLLM);
  const currentTtsModel = options.tts.find(m => m.id === selectedTTS);

  // Determine unique providers for the inputs
  const activeProviders = Array.from(new Set([
    currentSttModel?.provider,
    currentLlmModel?.provider,
    currentTtsModel?.provider
  ].filter(Boolean) as string[]));

  const totalLatency = (currentSttModel?.latency || 0) + (currentLlmModel?.latency || 0) + (currentTtsModel?.latency || 0);
  const avgAccuracy = ((currentSttModel?.accuracy || 0) + (currentLlmModel?.accuracy || 0) + (currentTtsModel?.accuracy || 0)) / 3;

  const wsSnippet = generatedKey ? `// Node.js WebSocket Example
import WebSocket from 'ws';

const ws = new WebSocket('${getApiBaseUrl().replace('http', 'ws').replace('/api', '')}/api/v1/stream?token=${generatedKey}&prompt=You+are+a+helpful+assistant');

ws.on('open', () => {
  console.log('Connected to S2S Pipeline!');
  
  // Stream 16kHz PCM Audio to the endpoint
  // ws.send(audioBuffer);
});

ws.on('message', (data) => {
  // Receive 16kHz PCM Audio from the AI
  // playAudio(data);
});` : '';

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#050505] px-4 sm:px-6 pt-24 pb-12 font-sans text-zinc-200 selection:bg-zinc-800">
      {/* Rich Background Elements */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px]"></div>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-blue-500/[0.03] rounded-full blur-[120px] pointer-events-none"></div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>

      <div className="w-full max-w-6xl mx-auto relative z-10 space-y-8">
        
        {/* Header */}
        <div className="mb-8 sm:mb-10 flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="text-left">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.05] bg-white/[0.02] mb-3">
              <BookOpen className="w-3 h-3 text-blue-400" />
              <span className="text-[9px] font-bold tracking-widest text-zinc-300 uppercase">Developers</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">API Configuration<span className="text-zinc-500">.</span></h1>
            <p className="text-zinc-400 text-xs leading-relaxed">
              Configure your voice pipeline and manage API keys for external integrations.
            </p>
          </div>
          <Link 
            to="/developer/docs" 
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 rounded-lg text-xs font-medium transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            View API Usage Guide
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          
          {/* Left Column: Pipeline Builder */}
          <div className="lg:col-span-7 space-y-8">
            <section>
              <h2 className="text-sm font-medium text-white mb-6">Voice Pipeline</h2>
              
              <div className="space-y-1">
                <ModelSelect 
                  label="Speech-to-Text" 
                  options={options.stt} 
                  value={selectedSTT} 
                  onChange={setSelectedSTT} 
                />
                
                <ModelSelect 
                  label="Intelligence" 
                  options={options.llm} 
                  value={selectedLLM} 
                  onChange={setSelectedLLM} 
                />

                <ModelSelect 
                  label="Text-to-Speech" 
                  options={options.tts} 
                  value={selectedTTS} 
                  onChange={setSelectedTTS} 
                />
              </div>
            </section>

            <div className="h-px bg-white/[0.05] my-8"></div>

            <section>
              <h2 className="text-sm font-medium text-white mb-4">Pipeline Metrics</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-[#09090b] border border-white/[0.08] rounded-xl relative shadow-sm">
                  <div className="text-xs text-zinc-500 mb-1 flex items-center justify-between">
                    {testedLatency ? 'Tested Latency' : 'Estimated Latency'}
                    {testedLatency && (
                      <span className="flex h-2 w-2 relative ml-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                      </span>
                    )}
                  </div>
                  <div className="text-lg font-medium text-zinc-200">
                    {testedLatency ? (
                       <span className="text-green-400">{testedLatency}</span>
                    ) : (
                       `~${totalLatency}`
                    )}
                    <span className="text-xs text-zinc-500 ml-1">ms</span>
                  </div>
                </div>
                <div className="p-4 bg-[#09090b] border border-white/[0.08] rounded-xl shadow-sm">
                  <div className="text-xs text-zinc-500 mb-1">Average Accuracy</div>
                  <div className="text-lg font-medium text-zinc-200">{avgAccuracy.toFixed(1)}<span className="text-xs text-zinc-500 ml-1">%</span></div>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Key Generation */}
          <div className="lg:col-span-5">
            <section className="bg-[#09090b] border border-white/[0.08] p-5 rounded-2xl shadow-xl">
              <h2 className="text-sm font-medium text-white mb-6">Configure Credentials</h2>
              
              <div className="space-y-4">
                {generatedKey ? (
                  <div className="animate-in fade-in duration-200">
                    <div className="p-4 bg-black/40 border border-white/[0.05] rounded-xl mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] uppercase text-zinc-400 font-medium tracking-wider">Secret Key</span>
                        <button onClick={() => copyToClipboard(generatedKey)} className="text-blue-500 hover:text-blue-400 transition-colors">
                          {copied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <div className="font-mono text-xs text-zinc-300 break-all bg-black p-2 rounded border border-white/[0.05]">
                        {generatedKey}
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-2">Copy this key now. You won't be able to see it again.</p>
                    </div>

                    <div className="p-4 bg-black/40 border border-white/[0.05] rounded-xl mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] uppercase text-zinc-400 font-medium tracking-wider">Test with WebSocket</span>
                        <button onClick={() => copyToClipboard(wsSnippet, true)} className="text-zinc-500 hover:text-zinc-400 transition-colors">
                          {curlCopied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <pre className="font-mono text-[10px] text-zinc-400 overflow-x-auto bg-black p-3 rounded border border-white/[0.05] custom-scrollbar leading-relaxed">
                        {wsSnippet}
                      </pre>
                    </div>

                    <div className="flex gap-2">
                      {isTesting ? (
                        <button 
                          onClick={stopTesting}
                          className="w-full flex items-center justify-center gap-2 text-xs bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 rounded-xl py-2.5 transition-colors shadow-sm"
                        >
                          <Square className="w-3.5 h-3.5 fill-current" />
                          Stop Testing
                        </button>
                      ) : (
                        <button 
                          onClick={() => startTesting(generatedKey)}
                          className="w-full flex items-center justify-center gap-2 text-xs bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600/20 rounded-xl py-2.5 transition-colors shadow-sm"
                        >
                          <Mic className="w-3.5 h-3.5" />
                          Test Pipeline (Mic)
                        </button>
                      )}
                      <button 
                        onClick={() => { setGeneratedKey(null); stopTesting(); }} 
                        className="w-full text-xs bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl py-2.5 transition-colors shadow-sm"
                      >
                        Done
                      </button>
                    </div>

                    {isTesting && (
                      <div className="flex items-center gap-2 text-[10px] text-blue-400 bg-blue-500/5 p-3 rounded-lg border border-blue-500/10 mt-3">
                        <Activity className="w-3.5 h-3.5 animate-pulse" />
                        <span>Live WebSocket stream active. Speak into your microphone.</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs text-zinc-500 mb-2 block">Connection Name</label>
                      <input 
                        type="text" 
                        value={keyName}
                        onChange={(e) => setKeyName(e.target.value)}
                        className="w-full bg-[#050505] border border-white/[0.08] px-3 py-2.5 rounded-xl text-white text-xs font-medium focus:outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-600"
                        placeholder="e.g. Production Env"
                      />
                    </div>

                    <div className="pt-2 pb-2">
                      <div className="text-[10px] uppercase text-zinc-500 font-medium tracking-wider mb-3">Provider API Keys</div>
                      <div className="space-y-3">
                        {activeProviders.map(provider => (
                          <div key={provider}>
                            <label className="text-xs text-zinc-400 mb-1.5 block">{provider} API Key</label>
                            <input 
                              type="password"
                              value={providerKeys[provider] || ''}
                              onChange={(e) => setProviderKeys({...providerKeys, [provider]: e.target.value})}
                              className="w-full bg-[#050505] border border-white/[0.08] px-3 py-2.5 rounded-xl text-white text-xs font-medium focus:outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-700"
                              placeholder={`Enter ${provider} API Key`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <button 
                      onClick={handleGenerateKey} 
                      disabled={generating || !keyName.trim()}
                      className="w-full bg-blue-600 text-white hover:bg-blue-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed rounded-xl py-2.5 text-xs font-semibold mt-2 transition-colors"
                    >
                      {generating ? 'Generating...' : 'Generate Key'}
                    </button>
                  </>
                )}
              </div>
            </section>
          </div>
        </div>

        {/* API Keys Table */}
        <section className="pt-8 border-t border-white/[0.05]">
          <h2 className="text-sm font-medium text-white mb-6">Active Keys</h2>
          
          {keys.length === 0 ? (
            <div className="text-sm text-zinc-600">No active API keys found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-zinc-500 border-b border-zinc-900">
                  <tr>
                    <th className="pb-3 font-normal">Name</th>
                    <th className="pb-3 font-normal">Key Prefix</th>
                    <th className="pb-3 font-normal">Pipeline Config</th>
                    <th className="pb-3 font-normal text-right">Created</th>
                    <th className="pb-3 font-normal text-right"></th>
                  </tr>
                </thead>
                <tbody className="text-zinc-300">
                  {keys.map(k => (
                    <tr key={k._id} className="border-b border-zinc-900/50 group">
                      <td className="py-4 font-medium">{k.name}</td>
                      <td className="py-4 font-mono text-xs text-zinc-500">{k.keyPrefix}</td>
                      <td className="py-4">
                        <div className="flex gap-1.5 text-[10px]">
                          <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                            {options.stt.find(o => o.id === k.pipelineConfig.sttModel)?.name || 'Unknown'}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                            {options.llm.find(o => o.id === k.pipelineConfig.llmModel)?.name || 'Unknown'}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-zinc-900 text-zinc-400 border border-zinc-800">
                            {options.tts.find(o => o.id === k.pipelineConfig.ttsModel)?.name || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 text-right text-xs text-zinc-500">
                        {new Date(k.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-4 text-right">
                        <button 
                          onClick={() => handleDeleteKey(k._id)} 
                          className="text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          title="Revoke Key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  );
};

export default DeveloperPage;
