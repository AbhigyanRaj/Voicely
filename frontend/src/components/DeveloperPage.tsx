import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Trash2, 
  Copy, 
  CheckCircle2,
  ChevronDown,
  Mic,
  Activity,
  Square
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
    <div className="relative mb-6" ref={dropdownRef}>
      <label className="text-[12px] font-medium text-zinc-400 mb-2 block">{label}</label>
      <div className={`w-full bg-zinc-800 border ${open ? 'border-zinc-500' : 'border-white/[0.1]'} rounded-md px-3 py-2.5 cursor-pointer hover:border-zinc-400 transition-colors flex items-center justify-between`} onClick={() => setOpen(!open)}>
        {selectedModel ? (
          <div className="flex items-center gap-3">
            <span className="font-medium text-zinc-100 text-[13px]">{selectedModel.name}</span>
            <span className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase px-1.5 py-0.5 bg-white/[0.03] rounded-md">{selectedModel.provider}</span>
          </div>
        ) : (
          <span className="text-zinc-500 text-sm">Select model...</span>
        )}
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-zinc-800 border border-white/[0.1] rounded-md shadow-xl overflow-hidden py-1">
          <div className="max-h-64 overflow-y-auto p-1 custom-scrollbar">
            {options.map((option) => {
              const disabled = option.isComingSoon;
              return (
                <div 
                  key={option.id}
                  onClick={() => { if (!disabled) { onChange(option.id); setOpen(false); } }}
                  className={`px-3 py-2 rounded-sm flex items-center justify-between transition-colors
                    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-zinc-800/50'}
                    ${value === option.id ? 'bg-zinc-800/30 text-white' : 'text-zinc-400'}
                  `}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${value === option.id ? 'font-medium text-white' : ''}`}>{option.name}</span>
                      {disabled && <span className="text-[8px] uppercase font-bold text-zinc-500 tracking-widest border border-zinc-700 bg-zinc-800/50 px-1.5 py-0.5 rounded-sm ml-1">Coming Soon</span>}
                    </div>
                    <div className="text-[10px] text-zinc-500">{option.description}</div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 text-[9px] text-zinc-500">
                    <span>{option.latency}ms</span>
                    <span>{option.accuracy}% acc</span>
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
  const queryClient = useQueryClient();
  const [selectedSTT, setSelectedSTT] = useState<string>('');
  const [selectedLLM, setSelectedLLM] = useState<string>('');
  const [selectedTTS, setSelectedTTS] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'api' | 'keys' | 'webhooks' | 'logs'>('api');
  
  const [keyName, setKeyName] = useState('');
  const [providerKeys, setProviderKeys] = useState<Record<string, string>>({});
  
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [testedLatency, setTestedLatency] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);

  const { isTesting, startTesting, stopTesting } = useDeveloperS2S();

  const { data: options, isLoading: optionsLoading } = useQuery({
    queryKey: ['pipelineOptions'],
    queryFn: getPipelineOptions,
  });

  const { data: keys = [], isLoading: keysLoading } = useQuery({
    queryKey: ['developerKeys'],
    queryFn: getDeveloperKeys,
  });

  useEffect(() => {
    if (options && !selectedSTT) {
      if (options.stt.length) setSelectedSTT(options.stt[0].id);
      if (options.llm.length) setSelectedLLM(options.llm[0].id);
      if (options.tts.length) setSelectedTTS(options.tts[0].id);
    }
  }, [options, selectedSTT]);

  const generateKeyMutation = useMutation({
    mutationFn: async () => {
      if (!keyName.trim()) throw new Error("Key name is required");
      return generateDeveloperKey(keyName, selectedSTT, selectedLLM, selectedTTS, providerKeys);
    },
    onSuccess: (result) => {
      setGeneratedKey(result.key);
      if (result.actualLatency) {
        setTestedLatency(result.actualLatency);
      }
      queryClient.invalidateQueries({ queryKey: ['developerKeys'] });
      setKeyName('');
      setProviderKeys({});
    },
    onError: (error) => {
      console.error('Failed to generate key', error);
    }
  });

  const deleteKeyMutation = useMutation({
    mutationFn: (id: string) => deleteDeveloperKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['developerKeys'] });
    },
    onError: (error) => {
      console.error('Failed to delete key', error);
    }
  });

  const handleGenerateKey = () => {
    setTestedLatency(null);
    generateKeyMutation.mutate();
  };

  const handleDeleteKey = (id: string) => {
    deleteKeyMutation.mutate(id);
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

  if (optionsLoading || keysLoading || !options) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] px-6 sm:px-12 pt-20 pb-12 font-sans flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-6 h-6 rounded-full border-2 border-zinc-800 border-t-zinc-500 animate-spin"></div>
          <div className="text-zinc-600 text-sm">Loading environment...</div>
        </div>
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

const ws = new WebSocket('${getApiBaseUrl().replace('http', 'ws').replace('/api/v1', '')}/api/v1/stream?token=${generatedKey}&prompt=You+are+a+helpful+assistant');

ws.on('open', () => {
  console.log('Connected to S2S Pipeline!');
  // ws.send(audioBuffer);
});` : '';

  return (
    <div className="h-screen overflow-hidden bg-zinc-950 flex flex-col font-sans text-zinc-200">
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #27272a; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #3f3f46; }
      `}</style>

      <div className="w-full max-w-6xl mx-auto flex flex-col h-full px-6 sm:px-12 pt-16 pb-8">
        
        {/* Modern Header */}
        <div className="flex-shrink-0 flex flex-col md:flex-row md:items-end justify-between gap-6 pb-2">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight mb-2">API Configuration</h1>
            <p className="text-zinc-400 text-sm">Manage your voice pipeline models and secure developer credentials.</p>
          </div>
          <Link 
            to="/developer/docs" 
            className="text-sm font-medium text-zinc-400 hover:text-white bg-transparent border border-white/[0.08] hover:bg-white/[0.04] px-4 py-2 rounded-md transition-colors flex items-center gap-2"
          >
            Documentation &rarr;
          </Link>
        </div>

        {/* Tab Navigation */}
        <div className="flex-shrink-0 flex items-center gap-6 border-b border-white/[0.08] overflow-x-auto custom-scrollbar mt-6">
          {(['api', 'keys', 'webhooks', 'logs'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 px-2 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                activeTab === tab
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab === 'api' ? 'API & Pipeline' : tab === 'keys' ? 'API Keys' : tab === 'webhooks' ? 'Webhooks' : 'System Logs'}
            </button>
          ))}
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar mt-8 pb-4 pr-2">
          {activeTab === 'api' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Column: Pipeline Builder */}
            <div className="lg:col-span-7 space-y-6">
              <section className="bg-zinc-900/40 border border-white/[0.04] p-6 sm:p-8 rounded-lg">
                <h2 className="text-[15px] font-semibold text-white mb-6">Voice Pipeline Models</h2>
                <div className="space-y-2">
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

              <section className="bg-zinc-900/40 border border-white/[0.04] p-6 sm:p-8 rounded-lg">
                <h2 className="text-[15px] font-semibold text-white mb-6">Pipeline Performance Metrics</h2>
                <div className="grid grid-cols-2 gap-8">
                  <div className="bg-zinc-900/50 border border-white/[0.05] p-5 rounded-md">
                    <div className="text-[12px] font-medium text-zinc-400 mb-2 flex items-center gap-2">
                      {testedLatency ? 'Tested Latency' : 'Estimated Latency'}
                      {testedLatency && (
                        <span className="flex h-1.5 w-1.5 relative">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                        </span>
                      )}
                    </div>
                    <div className="text-3xl font-semibold text-zinc-100">
                      {testedLatency ? (
                         <span className="text-green-400">{testedLatency}</span>
                      ) : (
                         <span className="text-zinc-200">~{totalLatency}</span>
                      )}
                      <span className="text-sm text-zinc-500 ml-1 font-normal">ms</span>
                    </div>
                  </div>
                  <div className="bg-zinc-900/50 border border-white/[0.05] p-5 rounded-md">
                    <div className="text-[12px] font-medium text-zinc-400 mb-2">Average Accuracy</div>
                    <div className="text-3xl font-semibold text-zinc-100">{avgAccuracy.toFixed(1)}<span className="text-sm text-zinc-500 ml-1 font-normal">%</span></div>
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Key Generation */}
            <div className="lg:col-span-5">
              <section className="bg-zinc-900/40 border border-white/[0.04] p-6 sm:p-8 rounded-lg h-full">
                <h2 className="text-[15px] font-semibold text-white mb-6">Integration Credentials</h2>
                  
                  <div className="space-y-6">
                    {generatedKey ? (
                      <div className="animate-in fade-in duration-300 space-y-6">
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Secret Key</span>
                            <button onClick={() => copyToClipboard(generatedKey)} className="text-zinc-400 hover:text-white transition-colors">
                              {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <div className="font-mono text-[13px] text-zinc-200 break-all bg-zinc-900/50 py-3 px-4 rounded-md border border-white/[0.05]">
                            {generatedKey}
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-2">Copy this key now. It will not be shown again.</p>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">WebSocket Snippet</span>
                            <button onClick={() => copyToClipboard(wsSnippet, true)} className="text-zinc-400 hover:text-white transition-colors">
                              {curlCopied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                          <pre className="font-mono text-[11px] text-zinc-400 overflow-x-auto bg-zinc-900/50 p-4 rounded-md border border-white/[0.05] custom-scrollbar leading-relaxed">
                            {wsSnippet}
                          </pre>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                          {isTesting ? (
                            <button 
                              onClick={stopTesting}
                              className="flex-1 flex items-center justify-center gap-2 text-xs bg-transparent border border-red-900/50 text-red-400 hover:bg-red-950/30 rounded-md py-2.5 transition-colors"
                            >
                              <Square className="w-3 h-3 fill-current" />
                              Stop
                            </button>
                          ) : (
                            <button 
                              onClick={() => startTesting(generatedKey)}
                              className="flex-1 flex items-center justify-center gap-2 text-xs bg-transparent border border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-md py-2.5 transition-colors"
                            >
                              <Mic className="w-3.5 h-3.5" />
                              Test Pipeline
                            </button>
                          )}
                          <button 
                            onClick={() => { setGeneratedKey(null); stopTesting(); }} 
                            className="flex-1 text-xs bg-white text-black hover:bg-zinc-200 font-medium rounded-md py-2.5 transition-colors"
                          >
                            Done
                          </button>
                        </div>
                        
                        {isTesting && (
                          <div className="flex items-center gap-2 text-[11px] text-green-400 bg-green-500/10 p-3 rounded-md border border-green-500/20">
                            <Activity className="w-3.5 h-3.5 animate-pulse" />
                            <span>Live streaming. Speak into your microphone.</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div>
                          <label className="text-[13px] font-medium text-zinc-400 mb-2 block">Connection Name</label>
                          <input 
                            type="text" 
                            value={keyName}
                            onChange={(e) => setKeyName(e.target.value)}
                            className="w-full bg-zinc-900/50 border border-white/[0.1] px-3 h-10 rounded-md text-zinc-200 text-sm focus:outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-500"
                            placeholder="e.g. Production Environment"
                          />
                        </div>

                        <div className="pt-2">
                          <div className="text-[12px] font-medium text-zinc-500 mb-4">Required Provider Keys</div>
                          <div className="space-y-4">
                            {activeProviders.map(provider => (
                              <div key={provider}>
                                <label className="text-[12px] text-zinc-400 mb-2 block">{provider}</label>
                                <input 
                                  type="password"
                                  value={providerKeys[provider] || ''}
                                  onChange={(e) => setProviderKeys({...providerKeys, [provider]: e.target.value})}
                                  className="w-full bg-zinc-900/50 border border-white/[0.1] px-3 h-10 rounded-md text-zinc-200 text-sm focus:outline-none focus:border-zinc-400 transition-colors placeholder:text-zinc-500"
                                  placeholder="API Key"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <button 
                          onClick={handleGenerateKey} 
                          disabled={generateKeyMutation.isPending || !keyName.trim()}
                          className="w-full bg-white hover:bg-zinc-200 text-black disabled:opacity-50 disabled:cursor-not-allowed rounded-md h-10 text-[13px] font-semibold mt-4 transition-colors"
                        >
                          {generateKeyMutation.isPending ? 'Generating...' : 'Generate API Key'}
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
          )}

          {activeTab === 'keys' && (
            <section className="bg-zinc-900/40 border border-white/[0.04] rounded-lg overflow-hidden h-full flex flex-col">
              <div className="px-6 sm:px-8 py-6 border-b border-white/[0.04] flex-shrink-0">
                <h2 className="text-[15px] font-semibold text-white">Active Integrations</h2>
              </div>
              
              {keys.length === 0 ? (
                <div className="text-[13px] text-zinc-500 p-8 text-center bg-zinc-900/50">No active API keys found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="text-[12px] font-medium text-zinc-400 bg-zinc-900/80 border-b border-white/[0.04]">
                      <tr>
                        <th className="py-4 px-6 sm:px-8 font-normal">Name</th>
                        <th className="py-4 px-6 sm:px-8 font-normal">Prefix</th>
                        <th className="py-4 px-6 sm:px-8 font-normal">Configuration</th>
                        <th className="py-4 px-6 sm:px-8 font-normal text-right">Created</th>
                        <th className="py-4 px-6 sm:px-8 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-300">
                      {keys.map(k => (
                        <tr key={k._id} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-colors group">
                          <td className="py-4 px-6 sm:px-8 font-medium text-zinc-100">{k.name}</td>
                          <td className="py-4 px-6 sm:px-8 font-mono text-[13px] text-zinc-500">{k.keyPrefix}</td>
                          <td className="py-4 px-6 sm:px-8">
                            <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">
                              <span className="px-2 py-1 bg-zinc-700/50 border border-white/[0.04] rounded-md">{options.stt.find(o => o.id === k.pipelineConfig.sttModel)?.name || '-'}</span>
                              <span className="px-2 py-1 bg-zinc-700/50 border border-white/[0.04] rounded-md">{options.llm.find(o => o.id === k.pipelineConfig.llmModel)?.name || '-'}</span>
                              <span className="px-2 py-1 bg-zinc-700/50 border border-white/[0.04] rounded-md">{options.tts.find(o => o.id === k.pipelineConfig.ttsModel)?.name || '-'}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6 sm:px-8 text-right text-[13px] text-zinc-500">
                            {new Date(k.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-4 px-6 sm:px-8 text-right">
                            <button 
                              onClick={() => handleDeleteKey(k._id)} 
                              className="text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                              title="Revoke Key"
                            >
                              <Trash2 strokeWidth={1.5} className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {activeTab === 'webhooks' && (
          <div className="flex flex-col items-start py-12">
            <h4 className="text-lg font-medium text-zinc-200 mb-2">Webhooks</h4>
            <p className="text-zinc-500 text-sm max-w-md">
              Configure endpoints to receive real-time call events and transcripts. This feature is currently in preview.
            </p>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="flex flex-col items-start py-12">
            <h4 className="text-lg font-medium text-zinc-200 mb-2">System Logs</h4>
            <p className="text-zinc-500 text-sm max-w-md">
              Detailed API logs, usage metrics, and error tracing will be available here. This feature is currently in preview.
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default DeveloperPage;
