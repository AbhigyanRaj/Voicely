import React, { useState, useEffect, useRef } from "react";
import { X, Mic, MicOff, Square, Loader2, Shield, AlertCircle, Sparkles, ChevronDown, Lock, Check } from "lucide-react";
import { getUserModules, getStoredToken } from "../lib/auth";
import type { VoiceModule } from "../lib/auth";
import { getApiBaseUrl } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  SARVAM_LANGUAGES,
  SARVAM_VOICES,
  CARTESIA_LANGUAGES,
  CARTESIA_VOICES
} from "../lib/ttsConfig";

export const DEMO_AGENTS = [
  {
    id: 'demo-agent-calm',
    name: 'Sarah',
    role: 'Corporate Advisor',
    emotion: 'CALM',
    description: 'Steady, reassuring advisor for enterprise calls.',
    color: 'emerald'
  },
  {
    id: 'demo-agent-enthusiastic',
    name: 'Alex',
    role: 'Sales Promoter',
    emotion: 'HIGH ENERGY',
    description: 'Upbeat rep qualifying business needs and volume.',
    color: 'blue'
  },
  {
    id: 'demo-agent-feedback',
    name: 'David',
    role: 'Feedback Collector',
    emotion: 'WARM',
    description: 'Friendly specialist collecting IVR feedback.',
    color: 'violet'
  },
  {
    id: 'demo-agent-support',
    name: 'Emma',
    role: 'Customer Support',
    emotion: 'EMPATHETIC',
    description: 'Helpful agent walking through troubleshooting steps.',
    color: 'rose'
  }
];

const AGENT_COLORS: Record<string, string> = {
  emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
  blue:    'border-blue-500/30 bg-blue-500/5 text-blue-400',
  violet:  'border-violet-500/30 bg-violet-500/5 text-violet-400',
  rose:    'border-rose-500/30 bg-rose-500/5 text-rose-400',
};

const AGENT_DOT: Record<string, string> = {
  emerald: 'bg-emerald-500',
  blue:    'bg-blue-500',
  violet:  'bg-violet-500',
  rose:    'bg-rose-500',
};

interface VoiceSandboxProps {
  open: boolean;
  onClose: () => void;
}

interface TranscriptLine {
  source: 'ai' | 'user';
  text: string;
  isFinal: boolean;
}

export const VoiceSandbox: React.FC<VoiceSandboxProps> = ({ open, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stage, setStage] = useState<'setup' | 'connecting' | 'connected' | 'ended'>('setup');
  const [agentSource, setAgentSource] = useState<'demo' | 'custom'>('demo');
  const [modules, setModules] = useState<VoiceModule[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>("demo-agent-calm");
  const [customerName, setCustomerName] = useState<string>("Steve");
  const [loadingModules, setLoadingModules] = useState<boolean>(false);
  const [submittingCall, setSubmittingCall] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en-US");
  const [selectedVoice, setSelectedVoice] = useState<string>("a7a59115-2425-4192-844c-1e98ec7d6877");
  const [ttsProvider, setTtsProvider] = useState<string>("cartesia");
  const [optimizeFor, setOptimizeFor] = useState<'latency' | 'quality'>('latency');

  useEffect(() => {
    if (selectedModuleId) {
      if (agentSource === 'demo') {
        setTtsProvider("cartesia");
        if (selectedLanguage !== 'en-US' && selectedLanguage !== 'hi-IN') {
          setSelectedLanguage("en-US");
        }
      } else if (modules.length > 0) {
        const activeMod = modules.find(m => (m._id || m.id) === selectedModuleId);
        if (activeMod) {
          setTtsProvider(activeMod.ttsProvider || "cartesia");
          setSelectedLanguage(activeMod.selectedLanguage || "en-US");
          setSelectedVoice(activeMod.selectedVoice || "a7a59115-2425-4192-844c-1e98ec7d6877");
        }
      }
    }
  }, [selectedModuleId, modules, agentSource]);

  useEffect(() => {
    let availableVoices = agentSource === 'demo'
      ? (selectedLanguage === 'hi-IN' ? SARVAM_VOICES['hi-IN'] : CARTESIA_VOICES['en-US']) || []
      : (ttsProvider === 'cartesia' ? CARTESIA_VOICES : SARVAM_VOICES)[selectedLanguage] || [];
      
    if (availableVoices.length > 0) {
      const match = availableVoices.find(v => v.id === selectedVoice);
      if (!match) setSelectedVoice(availableVoices[0].id);
    }
  }, [selectedLanguage, ttsProvider, agentSource]);

  const [callRecord, setCallRecord] = useState<any>(null);
  const [finalizedTranscripts, setFinalizedTranscripts] = useState<TranscriptLine[]>([]);
  const [activePartials, setActivePartials] = useState<Record<string, TranscriptLine>>({});
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState<boolean>(false);

  const streamWsRef = useRef<WebSocket | null>(null);
  const liveCallWsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorNodeRef = useRef<any>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeAudioNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const pollingIntervalRef = useRef<any>(null);
  const isMutedRef = useRef(isMuted);

  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  useEffect(() => {
    if (open) {
      const loadModules = async () => {
        setLoadingModules(true);
        try {
          const fetched = await getUserModules();
          setModules(fetched);
        } catch (err) {
          console.error("Failed to load modules for sandbox:", err);
        } finally {
          setLoadingModules(false);
        }
      };
      loadModules();
      setAgentSource('demo');
      setSelectedModuleId('demo-agent-calm');
      setStage('setup');
      setFinalizedTranscripts([]);
      setActivePartials({});
      setCallRecord(null);
    }
  }, [open]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [finalizedTranscripts, activePartials]);

  useEffect(() => { return () => cleanupSession(); }, []);

  const cleanupSession = () => {
    if (streamWsRef.current) { streamWsRef.current.close(); streamWsRef.current = null; }
    if (liveCallWsRef.current) { liveCallWsRef.current.close(); liveCallWsRef.current = null; }
    if (processorNodeRef.current) { processorNodeRef.current.disconnect(); processorNodeRef.current = null; }
    if (sourceNodeRef.current) { sourceNodeRef.current.disconnect(); sourceNodeRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }
    if (pollingIntervalRef.current) { clearInterval(pollingIntervalRef.current); pollingIntervalRef.current = null; }
  };

  const muLawToLinear = (b: number) => {
    b = ~b;
    const sign = b & 0x80 ? -1 : 1;
    const exp = (b >> 4) & 0x07;
    const mantissa = b & 0x0f;
    let s = ((mantissa << 3) + 132) << exp;
    s -= 132;
    return (sign * s) / 32768.0;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
  };

  const playAudioChunk = (base64Payload: string, encoding = 'mulaw', sampleRate = 8000) => {
    const ac = audioContextRef.current;
    if (!ac) return;
    const binary = window.atob(base64Payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    let float32Data: Float32Array;
    if (encoding === 'pcm_f32le') {
      const view = new Float32Array(bytes.buffer);
      float32Data = new Float32Array(view.length);
      for (let i = 0; i < view.length; i++) float32Data[i] = view[i];
    } else {
      float32Data = new Float32Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) float32Data[i] = muLawToLinear(bytes[i]);
    }
    if (ac.state === "suspended") ac.resume();
    const buf = ac.createBuffer(1, float32Data.length, sampleRate);
    buf.getChannelData(0).set(float32Data);
    const source = ac.createBufferSource();
    source.buffer = buf;
    source.connect(ac.destination);
    const now = ac.currentTime;
    if (nextStartTimeRef.current < now) nextStartTimeRef.current = now + 0.05;
    setIsAgentSpeaking(true);
    activeAudioNodesRef.current.push(source);
    source.onended = () => {
      activeAudioNodesRef.current = activeAudioNodesRef.current.filter(n => n !== source);
      if (ac.currentTime >= nextStartTimeRef.current - 0.08) setIsAgentSpeaking(false);
    };
    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += buf.duration;
  };

  const startAudioStreaming = async (callSid: string) => {
    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 8000 });
      const ac = audioContextRef.current;
      sourceNodeRef.current = ac.createMediaStreamSource(mediaStreamRef.current);
      await ac.audioWorklet.addModule('/audio-processor.js');
      processorNodeRef.current = new AudioWorkletNode(ac, 'audio-processor');
      processorNodeRef.current.port.onmessage = (e: MessageEvent) => {
        if (isMutedRef.current) return;
        const ws = streamWsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ event: 'media', media: { payload: arrayBufferToBase64(e.data.buffer) } }));
      };
      sourceNodeRef.current.connect(processorNodeRef.current);
      processorNodeRef.current.connect(ac.destination);
    } catch (err) {
      console.error("Mic capture failed:", err);
      alert("Failed to access microphone. Allow microphone permissions and reload.");
      setStage('setup');
    }
  };

  const handleStartSandbox = async () => {
    if (!selectedModuleId || !customerName.trim()) {
      alert("Please choose a voice agent and enter your name.");
      return;
    }
    setSubmittingCall(true);
    setStage('connecting');
    setFinalizedTranscripts([]);
    setActivePartials({});
    setCallRecord(null);
    const token = getStoredToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      const response = await fetch(`${getApiBaseUrl()}/calls/browser-sandbox`, {
        method: "POST", headers,
        body: JSON.stringify({ moduleId: selectedModuleId, customerName: customerName.trim(), selectedVoice, selectedLanguage, ttsProvider, optimizeFor })
      });
      if (!response.ok) throw new Error("Failed to register sandbox call");
      const resData = await response.json();
      const call = resData.call;
      setCallRecord(call);
      let streamWsUrl = "", liveCallWsUrl = "";
      const wsUrlConfig = import.meta.env.VITE_WS_URL;
      if (wsUrlConfig) {
        streamWsUrl = `${wsUrlConfig}/api/streams/browser`;
        liveCallWsUrl = `${wsUrlConfig}/live-call?callId=${call._id}`;
      } else {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host.includes(':') ? 'localhost:5001' : window.location.host;
        streamWsUrl = `${proto}//${host}/api/streams/browser`;
        liveCallWsUrl = `${proto}//${host}/live-call?callId=${call._id}`;
      }
      const tok = localStorage.getItem('vokai_jwt_token') || getStoredToken();
      if (tok) {
        streamWsUrl += `?token=${tok}`;
        liveCallWsUrl += `&token=${tok}`;
      }
      const streamWs = new WebSocket(streamWsUrl);
      streamWsRef.current = streamWs;
      streamWs.onopen = () => {
        streamWs.send(JSON.stringify({ event: "start", start: { callSid: call.twilioCallSid, streamSid: "browser_stream_" + Date.now() } }));
        startAudioStreaming(call.twilioCallSid);
      };
      streamWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === "media") {
            playAudioChunk(msg.media.payload, msg.media.encoding, msg.media.sampleRate);
          } else if (msg.event === "clear") {
            activeAudioNodesRef.current.forEach(n => { try { n.stop(); } catch(e) {} });
            activeAudioNodesRef.current = [];
            nextStartTimeRef.current = 0;
            setIsAgentSpeaking(false);
          }
        } catch (err) { console.error("Stream error:", err); }
      };
      streamWs.onclose = () => stopAudioStreaming();
      streamWs.onerror = (e) => console.error("Stream socket error:", e);
      const liveCallWs = new WebSocket(liveCallWsUrl);
      liveCallWsRef.current = liveCallWs;
      liveCallWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "transcript_update") {
            const { text, isFinal, source } = msg;
            if (isFinal) {
              setFinalizedTranscripts(prev => [...prev, { source, text, isFinal: true }]);
              setActivePartials(prev => { const n = { ...prev }; delete n[source]; return n; });
            } else {
              setActivePartials(prev => ({ ...prev, [source]: { source, text, isFinal: false } }));
            }
          }
        } catch (err) { console.error("Transcript error:", err); }
      };
      setStage('connected');
    } catch (err: any) {
      console.error("Sandbox init error:", err);
      alert("Failed to start Sandbox: " + err.message);
      setStage('setup');
    } finally {
      setSubmittingCall(false);
    }
  };

  const stopAudioStreaming = () => {
    if (processorNodeRef.current) { processorNodeRef.current.disconnect(); processorNodeRef.current = null; }
    if (sourceNodeRef.current) { sourceNodeRef.current.disconnect(); sourceNodeRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
    setIsAgentSpeaking(false);
  };

  const handleEndSandboxCall = async () => {
    if (!callRecord) return;
    setStage('setup');
    if (streamWsRef.current && streamWsRef.current.readyState === WebSocket.OPEN) {
      streamWsRef.current.send(JSON.stringify({ event: 'stop' }));
    }
    cleanupSession();
  };

  if (!open) return null;

  const currentDemoAgent = DEMO_AGENTS.find(d => d.id === selectedModuleId);
  const languages = agentSource === 'demo'
    ? [
        { code: 'en-US', label: 'English' },
        { code: 'hi-IN', label: 'Hindi' }
      ]
    : (ttsProvider === 'cartesia' ? CARTESIA_LANGUAGES : SARVAM_LANGUAGES);

  const voices = agentSource === 'demo'
    ? (selectedLanguage === 'hi-IN' ? SARVAM_VOICES['hi-IN'] : CARTESIA_VOICES['en-US']) || []
    : (ttsProvider === 'cartesia' ? CARTESIA_VOICES : SARVAM_VOICES)[selectedLanguage] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-4xl bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200"
        style={{ height: '560px', maxHeight: '90vh' }}
      >
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 z-50 text-zinc-400 hover:text-zinc-700 focus:outline-none p-1.5 rounded-full hover:bg-zinc-100 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── SETUP ── */}
        {stage === 'setup' && (
          <div className="flex flex-1 h-full">
            {/* Left: Agent Selection */}
            <div className="w-full md:w-[45%] border-r border-zinc-200 bg-[#F9FAFB] flex flex-col relative overflow-hidden">
              <div className="p-6 pb-4 relative z-10">
                <div className="flex items-center gap-2 mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] animate-pulse" />
                  <span className="text-[13px] font-semibold text-zinc-900 tracking-tight">Voice Sandbox</span>
                </div>

                <div className="flex gap-1 bg-zinc-200/50 border border-zinc-200 rounded-lg p-1 mb-4">
                  {(['demo', 'custom'] as const).map(src => (
                    <button
                      key={src}
                      onClick={() => {
                        setAgentSource(src);
                        if (src === 'demo') setSelectedModuleId('demo-agent-calm');
                        else if (src === 'custom' && modules.length > 0) setSelectedModuleId(modules[0]._id || modules[0].id || '');
                        else setSelectedModuleId('');
                      }}
                      className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold tracking-wide transition-all ${
                        agentSource === src
                          ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/50'
                          : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100/50'
                      }`}
                    >
                      {src === 'demo' ? 'Demo Agents' : 'My Agents'}
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-zinc-400 text-center mb-4 uppercase tracking-widest font-semibold">Demo: Pre-built, no login. My Agent: Login required.</p>
              </div>

              <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar relative z-10">
                {loadingModules ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  </div>
                ) : agentSource === 'demo' ? (
                  <div className="space-y-2">
                    {DEMO_AGENTS.map(agent => {
                      const active = selectedModuleId === agent.id;
                      return (
                        <button
                          key={agent.id}
                          onClick={() => setSelectedModuleId(agent.id)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
                            active
                              ? `bg-white border border-blue-100 shadow-[0_2px_10px_-4px_rgba(0,68,255,0.15)]`
                              : 'border border-transparent bg-transparent hover:bg-black/[0.03]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${active ? 'bg-blue-50 text-blue-600' : 'bg-zinc-100 text-zinc-500 group-hover:bg-zinc-200 group-hover:text-zinc-700'}`}>
                              <span className="text-[12px] font-bold">{agent.name.charAt(0)}</span>
                            </div>
                            <div className="text-left">
                              <div className="flex items-center gap-2">
                                <p className={`text-[13px] font-semibold tracking-tight ${active ? 'text-zinc-900' : 'text-zinc-700'}`}>
                                  {agent.name}
                                </p>
                                <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-widest ${active ? 'bg-blue-50 text-blue-600' : 'bg-zinc-100 text-zinc-500'}`}>
                                  {agent.emotion}
                                </span>
                              </div>
                              <p className={`text-[11px] font-medium mt-0.5 ${active ? 'text-zinc-500' : 'text-zinc-500'}`}>
                                {agent.role}
                              </p>
                            </div>
                          </div>
                          {active && (
                            <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
                              <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="h-full flex flex-col justify-center">
                    {!user ? (
                      <div className="flex flex-col items-center gap-3 text-center px-4">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center mb-1">
                          <Shield className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[13px] text-zinc-900 font-semibold">No agent yet</p>
                          <p className="text-[11px] text-zinc-500">Create one in the dashboard. Test it here.</p>
                        </div>
                        <button onClick={() => { onClose(); navigate('/create-module'); }} className="px-4 py-2 bg-[#0044FF] hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-all mt-2">
                          Agent Builder
                        </button>
                      </div>
                    ) : modules.length === 0 ? (
                      <div className="flex flex-col items-center gap-3 text-center px-4">
                        <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center mb-1">
                          <AlertCircle className="w-4 h-4 text-zinc-400" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[13px] text-zinc-900 font-semibold">No custom agents found</p>
                          <p className="text-[11px] text-zinc-500">You haven't built any agents yet.</p>
                        </div>
                        <button onClick={() => { onClose(); navigate('/create-module'); }} className="px-4 py-2 bg-[#0044FF] hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-all mt-2">
                          Agent Builder
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2 mt-[-40px]">
                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block px-1">Select Custom Agent</label>
                        <div className="relative">
                          <select
                            value={selectedModuleId}
                            onChange={e => setSelectedModuleId(e.target.value)}
                            className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-2.5 text-zinc-900 text-[13px] font-medium appearance-none cursor-pointer focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
                          >
                            {modules.map(m => (
                              <option key={m._id || m.id} value={m._id || m.id}>{m.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Settings & CTA */}
            <div className="hidden md:flex flex-1 p-8 flex-col bg-white relative overflow-y-auto custom-scrollbar">
              <div className="relative z-10">
                <h3 className="text-[15px] font-bold text-zinc-900 mb-1 tracking-tight">Simulation Parameters</h3>
                <p className="text-zinc-500 text-[11px] mb-8">Configure the environment for your test call.</p>
                
                <div className="space-y-6">
                  {/* Row 1: Name */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Caller Name</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      placeholder="Steve"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-900 text-[13px] font-medium placeholder:text-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
                    />
                  </div>

                  {/* Row 2: Language & Voice */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Language</label>
                    <div className="relative">
                      <select
                        value={selectedLanguage}
                        onChange={e => setSelectedLanguage(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-900 text-[13px] font-medium appearance-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer shadow-sm"
                      >
                        {languages.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                    </div>
                    {agentSource === 'demo' && selectedLanguage.includes('hi') && (
                      <p className="text-[10px] text-amber-600 mt-1.5 italic font-medium">
                        Hindi demo coming soon. Available for custom agents.
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Voice</label>
                    <div className="relative">
                      <select
                        value={selectedVoice}
                        onChange={e => setSelectedVoice(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-900 text-[13px] font-medium appearance-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer shadow-sm"
                      >
                        {voices.map(v => <option key={v.id} value={v.id}>{v.label} ({v.gender})</option>)}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-auto pt-8 relative z-10">
                <button
                  onClick={handleStartSandbox}
                  disabled={!selectedModuleId || submittingCall || (agentSource === 'custom' && !user) || (agentSource === 'demo' && selectedLanguage.includes('hi'))}
                  className="w-full h-10 bg-[#0044FF] hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-[#0044FF] disabled:cursor-not-allowed text-white text-[11px] font-bold uppercase tracking-widest rounded-lg shadow-[0_4px_14px_0_rgba(0,118,255,0.39)] transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {submittingCall && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {submittingCall ? 'Initializing' : 'Start Session'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CONNECTING ── */}
        {stage === 'connecting' && (
          <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden bg-white">
            <div className="relative z-10 flex flex-col items-center space-y-4">
              <div className="relative w-12 h-12 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-20" />
                <div className="relative w-8 h-8 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-[13px] font-bold text-zinc-900 tracking-tight">Connecting</h3>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Pipeline starting</p>
              </div>
            </div>
          </div>
        )}

        {/* ── CONNECTED ── */}
        {stage === 'connected' && (
          <div className="flex flex-1 h-full bg-white overflow-hidden">
            {/* Left: Orb & Controls */}
            <div className="w-[40%] border-r border-zinc-200 bg-[#F9FAFB] flex flex-col items-center justify-between p-6 relative">
              
              <div className="w-full flex items-center justify-between z-10">
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-white border border-zinc-200 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse" />
                  <span className="text-[9px] font-bold text-zinc-900 uppercase tracking-widest">Live</span>
                </div>
                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">8kHz μ-Law</span>
              </div>

              <div className="flex flex-col items-center justify-center flex-1 w-full z-10 py-8">
                <div className="relative w-24 h-24 flex items-center justify-center mb-6">
                  {isAgentSpeaking && (
                    <div className="absolute inset-0 rounded-full bg-blue-500/10 animate-pulse" style={{ animationDuration: '2s' }} />
                  )}
                  <div className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm ${
                    isAgentSpeaking
                      ? 'bg-blue-50 border border-blue-200'
                      : 'bg-white border border-zinc-200'
                  }`}>
                    <Mic className={`w-5 h-5 transition-colors duration-300 ${isMuted ? 'text-zinc-400' : isAgentSpeaking ? 'text-blue-600' : 'text-zinc-600'}`} />
                  </div>
                </div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  {isAgentSpeaking ? 'Agent Speaking' : isMuted ? 'Mic Muted' : 'Listening...'}
                </span>
                <p className="text-[13px] font-bold text-zinc-900 mt-3">{currentDemoAgent ? currentDemoAgent.name : 'Custom Agent'}</p>
              </div>

              <div className="w-full space-y-2 z-10">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`w-full h-9 rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all flex items-center justify-center gap-2 shadow-sm ${
                    isMuted
                      ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  {isMuted ? 'Unmute' : 'Mute'}
                </button>
                <button
                  onClick={handleEndSandboxCall}
                  className="w-full h-9 bg-white border border-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-zinc-900 shadow-sm text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Square className="w-3 h-3 fill-current" />
                  End Session
                </button>
              </div>
            </div>

            {/* Right: Transcript */}
            <div className="flex-1 flex flex-col bg-white relative">
              <div className="px-6 py-4 border-b border-zinc-200">
                <h4 className="text-[13px] font-bold text-zinc-900 tracking-tight">Live Transcript</h4>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-5">
                {finalizedTranscripts.length === 0 && Object.keys(activePartials).length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                    <Sparkles className="w-6 h-6 text-blue-500 mb-2" />
                    <p className="text-[12px] font-semibold text-zinc-500">Connection established</p>
                  </div>
                ) : (
                  [...finalizedTranscripts, ...Object.values(activePartials)].map((line, idx) => (
                    <div key={idx} className={`flex flex-col w-full max-w-[90%] ${line.source === 'ai' ? 'self-start items-start' : 'self-end items-end ml-auto'}`}>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1 px-1">
                        {line.source === 'ai' ? (currentDemoAgent ? currentDemoAgent.name : 'Agent') : customerName}
                      </span>
                      <div className={`px-4 py-2.5 rounded-xl text-[13px] font-medium leading-relaxed shadow-sm ${
                        line.source === 'ai'
                          ? 'bg-zinc-100 border border-zinc-200 text-zinc-900 rounded-tl-sm'
                          : 'bg-[#0044FF] text-white rounded-tr-sm'
                      } ${!line.isFinal ? 'opacity-60 italic' : ''}`}>
                        {line.text}
                      </div>
                    </div>
                  ))
                )}
                <div ref={transcriptEndRef} className="h-2" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
