import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Mic, MicOff, Play, Square, MessageSquare, Loader2, Shield, CheckCircle2, AlertCircle, Sparkles, User, RefreshCw, BarChart } from "lucide-react";
import { Button } from "./ui/button";
import { getUserModules, getStoredToken } from "../lib/auth";
import type { VoiceModule } from "../lib/auth";
import { getApiBaseUrl } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { 
  SARVAM_LANGUAGES, 
  SARVAM_VOICES,
  CARTESIA_LANGUAGES,
  CARTESIA_VOICES
} from "../lib/ttsConfig";

export const DEMO_AGENTS = [
  { 
    id: 'demo-agent-calm', 
    name: 'Sarah (Calm Corporate Advisor)', 
    emotion: 'CALM/PROFESSIONAL', 
    description: 'Steady, reassuring corporate advisor collecting processes and latency challenges.' 
  },
  { 
    id: 'demo-agent-enthusiastic', 
    name: 'Alex (Enthusiastic Promoter)', 
    emotion: 'HIGH ENERGY', 
    description: 'Upbeat startup representative qualifying your business needs and volume.' 
  },
  { 
    id: 'demo-agent-feedback', 
    name: 'David (Feedback Collector)', 
    emotion: 'WARM/LISTENING', 
    description: 'Friendly success specialist asking about your IVR frustrations and feedback.' 
  },
  { 
    id: 'demo-agent-support', 
    name: 'Emma (Friendly Customer Support)', 
    emotion: 'EMPATHETIC', 
    description: 'Helpful support agent walking through troubleshooting steps with care.' 
  }
];

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
  const [stage, setStage] = useState<'setup' | 'connecting' | 'connected' | 'ended'>('setup');
  const [agentSource, setAgentSource] = useState<'demo' | 'custom'>('demo');
  const [modules, setModules] = useState<VoiceModule[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>("demo-agent-calm");
  const [customerName, setCustomerName] = useState<string>("Steve");
  const [loadingModules, setLoadingModules] = useState<boolean>(false);
  const [submittingCall, setSubmittingCall] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en-US");
  const [selectedVoice, setSelectedVoice] = useState<string>("79a125e8-cd45-4c13-8a67-188112f4dd22");
  const [ttsProvider, setTtsProvider] = useState<string>("cartesia");
  const [optimizeFor, setOptimizeFor] = useState<'latency' | 'quality'>('latency');

  // Sync selected voice list when selectedModuleId changes
  useEffect(() => {
    if (selectedModuleId && modules.length > 0) {
      const activeMod = modules.find(m => (m._id || m.id) === selectedModuleId);
      if (activeMod) {
        setTtsProvider(activeMod.ttsProvider || "cartesia");
        setSelectedLanguage(activeMod.selectedLanguage || "en-US");
        setSelectedVoice(activeMod.selectedVoice || "79a125e8-cd45-4c13-8a67-188112f4dd22");
      }
    }
  }, [selectedModuleId, modules]);

  // Adjust default voice if selected language or ttsProvider is manually overridden
  useEffect(() => {
    let availableVoices = (ttsProvider === 'cartesia' ? CARTESIA_VOICES : SARVAM_VOICES)[selectedLanguage] || [];

    if (availableVoices.length > 0) {
      const match = availableVoices.find(v => v.id === selectedVoice);
      if (!match) {
        setSelectedVoice(availableVoices[0].id);
      }
    }
  }, [selectedLanguage, ttsProvider]);
  
  // Active session state
  const [callRecord, setCallRecord] = useState<any>(null);
  const [finalizedTranscripts, setFinalizedTranscripts] = useState<TranscriptLine[]>([]);
  const [activePartials, setActivePartials] = useState<Record<string, TranscriptLine>>({});
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState<boolean>(false);

  // Audio nodes and socket references
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

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Load modules on mount/open
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
      
      // Reset state
      setAgentSource('demo');
      setSelectedModuleId('demo-agent-calm');
      setStage('setup');
      setFinalizedTranscripts([]);
      setActivePartials({});
      setCallRecord(null);
    }
  }, [open]);

  // Scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [finalizedTranscripts, activePartials]);

  // Clean up audio & sockets on unmount or close
  useEffect(() => {
    return () => {
      cleanupSession();
    };
  }, []);

  const cleanupSession = () => {
    // Sockets
    if (streamWsRef.current) {
      streamWsRef.current.close();
      streamWsRef.current = null;
    }
    if (liveCallWsRef.current) {
      liveCallWsRef.current.close();
      liveCallWsRef.current = null;
    }
    
    // Audio Context & Stream
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const muLawToLinear = (muLawByte: number): number => {
    muLawByte = ~muLawByte;
    const sign = muLawByte & 0x80 ? -1 : 1;
    const exponent = (muLawByte >> 4) & 0x07;
    const mantissa = muLawByte & 0x0f;
    let sample = ((mantissa << 3) + 132) << exponent;
    sample -= 132;
    return (sign * sample) / 32768.0;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  // Play audio payload
  const playAudioChunk = (base64Payload: string, encoding: string = 'mulaw', sampleRate: number = 8000) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    // Decode base64
    const binaryString = window.atob(base64Payload);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    let float32Data;
    if (encoding === 'pcm_f32le') {
      // 32-bit Float PCM linear
      const float32View = new Float32Array(bytes.buffer);
      float32Data = new Float32Array(float32View.length);
      for (let i = 0; i < float32View.length; i++) {
        float32Data[i] = float32View[i];
      }
    } else {
      // Convert mu-law to float32 linear
      float32Data = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        float32Data[i] = muLawToLinear(bytes[i]);
      }
    }

    // Play sequential chunks smoothly
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    // Wideband HD Voice 16kHz for sandbox testing, or 24kHz for Cartesia HD
    const activeSampleRate = sampleRate;
    const audioBuffer = audioContext.createBuffer(1, float32Data.length, activeSampleRate);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    const currentTime = audioContext.currentTime;
    if (nextStartTimeRef.current < currentTime) {
      nextStartTimeRef.current = currentTime + 0.05;
    }

    // Indicate that the agent is currently speaking
    setIsAgentSpeaking(true);
    
    activeAudioNodesRef.current.push(source);
    
    source.onended = () => {
      // Remove from active nodes
      activeAudioNodesRef.current = activeAudioNodesRef.current.filter(n => n !== source);
      
      // Check if sound finished
      if (audioContext.currentTime >= nextStartTimeRef.current - 0.08) {
        setIsAgentSpeaking(false);
      }
    };

    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;
  };

  // Connect bidirectional audio WebSocket
  const startAudioStreaming = async (callSid: string) => {
    try {
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 8000 });
      
      const audioContext = audioContextRef.current;
      sourceNodeRef.current = audioContext.createMediaStreamSource(mediaStreamRef.current);
      
      await audioContext.audioWorklet.addModule('/audio-processor.js');
      processorNodeRef.current = new AudioWorkletNode(audioContext, 'audio-processor');
      
      processorNodeRef.current.port.onmessage = (e: MessageEvent) => {
        if (isMutedRef.current) return;
        const ws = streamWsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const base64Audio = arrayBufferToBase64(e.data.buffer);

        ws.send(JSON.stringify({
          event: 'media',
          media: { payload: base64Audio }
        }));
      };

      sourceNodeRef.current.connect(processorNodeRef.current);
      processorNodeRef.current.connect(audioContext.destination);
    } catch (err) {
      console.error("Microphone capture startup failed:", err);
      alert("Failed to access your microphone. Please allow microhphone permissions and reload.");
      setStage('setup');
    }
  };

  // Launch browser Sandbox session
  const handleStartSandbox = async () => {
    if (!selectedModuleId || !customerName.trim()) {
      alert("Please choose a voice agent module and enter your name.");
      return;
    }

    setSubmittingCall(true);
    setStage('connecting');
    setFinalizedTranscripts([]);
    setActivePartials({});
    setCallRecord(null);

    const token = getStoredToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${getApiBaseUrl()}/calls/browser-sandbox`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          moduleId: selectedModuleId,
          customerName: customerName.trim(),
          selectedVoice,
          selectedLanguage,
          ttsProvider,
          optimizeFor
        })
      });

      if (!response.ok) {
        throw new Error("Failed to register sandbox call record in backend DB");
      }

      const resData = await response.json();
      const call = resData.call;
      setCallRecord(call);

      // Use configured VITE_WS_URL environment variable, falling back to window.location host if not defined
      let streamWsUrl = "";
      let liveCallWsUrl = "";
      const wsUrlConfig = import.meta.env.VITE_WS_URL;

      if (wsUrlConfig) {
        streamWsUrl = `${wsUrlConfig}/api/streams/browser`;
        liveCallWsUrl = `${wsUrlConfig}/live-call?callId=${call._id}`;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host.includes(':') ? 'localhost:5001' : window.location.host;
        streamWsUrl = `${protocol}//${host}/api/streams/browser`;
        liveCallWsUrl = `${protocol}//${host}/live-call?callId=${call._id}`;
      }

      // 1. Establish Audio Stream Connection
      const streamWs = new WebSocket(streamWsUrl);
      streamWsRef.current = streamWs;

      streamWs.onopen = () => {
        logger("Sandbox audio stream connected!");
        streamWs.send(JSON.stringify({
          event: "start",
          start: {
            callSid: call.twilioCallSid,
            streamSid: "browser_stream_" + Date.now()
          }
        }));
        
        // Start processing mic packets
        startAudioStreaming(call.twilioCallSid);
      };

      streamWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === "media") {
            playAudioChunk(msg.media.payload, msg.media.encoding, msg.media.sampleRate);
          } else if (msg.event === "clear") {
            // Barge-in request: purge queued audios
            activeAudioNodesRef.current.forEach(node => {
              try { node.stop(); } catch(e) {}
            });
            activeAudioNodesRef.current = [];
            nextStartTimeRef.current = 0;
            setIsAgentSpeaking(false);
          }
        } catch (err) {
          console.error("Stream payload error:", err);
        }
      };

      streamWs.onclose = () => {
        logger("Sandbox audio stream closed");
        stopAudioStreaming();
      };

      streamWs.onerror = (e) => {
        console.error("Stream socket error:", e);
      };

      // 2. Establish liveCall dashboard sync transcript connection
      const liveCallWs = new WebSocket(liveCallWsUrl);
      liveCallWsRef.current = liveCallWs;

      liveCallWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "transcript_update") {
            const { text, isFinal, source } = msg;
            if (isFinal) {
              setFinalizedTranscripts(prev => [...prev, { source, text, isFinal: true }]);
              setActivePartials(prev => {
                const next = { ...prev };
                delete next[source];
                return next;
              });
            } else {
              setActivePartials(prev => ({
                ...prev,
                [source]: { source, text, isFinal: false }
              }));
            }
          }
        } catch (err) {
          console.error("Transcript socket payload error:", err);
        }
      };

      setStage('connected');

    } catch (err: any) {
      console.error("Initiation error:", err);
      alert("Failed to boot up Sandbox: " + err.message);
      setStage('setup');
    } finally {
      setSubmittingCall(false);
    }
  };

  const stopAudioStreaming = () => {
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setIsAgentSpeaking(false);
  };

  const handleEndSandboxCall = async () => {
    if (!callRecord) return;
    
    // Return immediately to setup stage instead of polling for analysis
    setStage('setup');

    // Send final stop command
    if (streamWsRef.current && streamWsRef.current.readyState === WebSocket.OPEN) {
      streamWsRef.current.send(JSON.stringify({ event: 'stop' }));
    }

    cleanupSession();
  };

  const logger = (msg: string) => {
    console.log(`[VoiceSandbox] ${msg}`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[92vh] bg-[#0A0A0A] border border-white/10 rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.8)] relative z-10 flex flex-col my-4 animate-in zoom-in-95 duration-300">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none"></div>
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-5 flex-shrink-0 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></div>
            <h2 className="text-xs font-medium text-white tracking-wide">
              Voice Sandbox
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="text-zinc-500 hover:text-white transition-colors relative z-10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Setup Stage */}
        {stage === 'setup' && (
          <div className="p-8 sm:p-10 flex flex-col space-y-8 overflow-y-auto">
            {loadingModules ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <span className="text-xs text-zinc-500">Retrieving modules...</span>
              </div>
            ) : (
              <div className="flex flex-col space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Left Column */}
                  <div className="space-y-5">
                    <div>
                  <div className="flex space-x-6 border-b border-white/10 pb-2 mb-6 relative z-10">
                    <button
                      type="button"
                      onClick={() => {
                        setAgentSource('demo');
                        setSelectedModuleId('demo-agent-calm');
                      }}
                      className={`text-xs font-medium tracking-wide pb-2 border-b-2 transition-all -mb-[10px] ${
                        agentSource === 'demo' ? 'text-white border-white' : 'text-zinc-500 border-transparent hover:text-zinc-300'
                      }`}
                    >
                      Demo Agents
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAgentSource('custom');
                        if (user) {
                          if (modules.length > 0) {
                            setSelectedModuleId(modules[0]._id || modules[0].id || "");
                          } else {
                            setSelectedModuleId("");
                          }
                        } else {
                          setSelectedModuleId("");
                        }
                      }}
                      className={`text-xs font-medium tracking-wide pb-2 border-b-2 transition-all -mb-[10px] ${
                        agentSource === 'custom' ? 'text-white border-white' : 'text-zinc-500 border-transparent hover:text-zinc-300'
                      }`}
                    >
                      Test Your Agent
                    </button>
                  </div>

                  <label className="block text-xs font-medium text-zinc-400 mb-2 relative z-10">
                    Select Voice Agent
                  </label>

                  {agentSource === 'demo' ? (
                    <div className="space-y-3 relative z-10">
                      <div className="relative">
                        <select
                          value={selectedModuleId}
                          onChange={(e) => setSelectedModuleId(e.target.value)}
                          className="w-full h-10 bg-transparent border-b border-white/10 px-0 text-white text-sm focus:outline-none focus:border-white transition-all appearance-none cursor-pointer font-light rounded-none"
                        >
                          {DEMO_AGENTS.map((d) => (
                            <option key={d.id} value={d.id} className="bg-[#0A0A0A] text-white">
                              {d.name}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-zinc-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>

                      {/* Demo Agent Details Card */}
                      {(() => {
                        const currentDemo = DEMO_AGENTS.find(d => d.id === selectedModuleId);
                        if (!currentDemo) return null;
                        return (
                          <div className="pt-2 animate-in fade-in duration-300">
                            <div className="flex items-center gap-1.5 mb-2">
                              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">
                                {currentDemo.emotion}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-400 font-light leading-relaxed">{currentDemo.description}</p>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div>
                      {!user ? (
                        <div className="p-4 bg-white/[0.03] border border-white/10 rounded-lg text-center">
                          <Shield className="w-5 h-5 text-blue-500 mx-auto mb-2 opacity-80" />
                          <h4 className="text-white text-sm font-semibold mb-1">Sign in required</h4>
                          <p className="text-xs text-zinc-400">Please sign in or create an account to build and test your own custom voice agents.</p>
                        </div>
                      ) : modules.length === 0 ? (
                        <div className="p-4 bg-white/[0.03] border border-white/10 rounded-lg text-center">
                          <AlertCircle className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                          <p className="text-sm text-zinc-400">No active Voice Agents found. Please create a module first.</p>
                        </div>
                      ) : (
                        <div className="relative">
                          <select
                            value={selectedModuleId}
                            onChange={(e) => setSelectedModuleId(e.target.value)}
                            className="w-full h-10 bg-transparent border-b border-white/10 px-0 text-white text-sm focus:outline-none focus:border-white transition-all appearance-none cursor-pointer font-light rounded-none"
                          >
                            {modules.map((m) => (
                              <option key={m._id || m.id} value={m._id || m.id} className="bg-[#0A0A0A] text-white">
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-zinc-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                    </div>
                  </div>
                  {/* Right Column */}
                  <div className="space-y-5 relative z-10">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-2">
                    Your Name (Simulation)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Steve"
                      className="w-full h-10 bg-transparent border-b border-white/10 px-0 text-white text-sm focus:outline-none focus:border-white transition-all placeholder:text-zinc-600 font-light rounded-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-3">
                    Optimization Mode
                  </label>
                    <div className="flex space-x-6">
                      <button
                        type="button"
                        onClick={() => setOptimizeFor('latency')}
                        className={`text-xs font-light transition-all ${
                          optimizeFor === 'latency' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                         Speed (Low Latency)
                      </button>
                      <button
                        type="button"
                        onClick={() => setOptimizeFor('quality')}
                        className={`text-xs font-light transition-all ${
                          optimizeFor === 'quality' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                         Quality (Natural Flow)
                      </button>
                    </div>
                  </div>



                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-2">
                        Language
                      </label>
                      <div className="relative">
                        <select
                          value={selectedLanguage}
                          onChange={(e) => setSelectedLanguage(e.target.value)}
                          className="w-full h-10 bg-transparent border-b border-white/10 px-0 text-white text-sm focus:outline-none focus:border-white transition-all appearance-none cursor-pointer font-light rounded-none"
                        >
                          {(ttsProvider === 'cartesia' ? CARTESIA_LANGUAGES : SARVAM_LANGUAGES).map((l) => (
                            <option key={l.code} value={l.code} className="bg-[#0A0A0A] text-white">
                              {l.label}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-zinc-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-zinc-400 mb-2">
                        Voice Options
                      </label>
                      <div className="relative">
                        <select
                          value={selectedVoice}
                          onChange={(e) => setSelectedVoice(e.target.value)}
                          className="w-full h-10 bg-transparent border-b border-white/10 px-0 text-white text-sm focus:outline-none focus:border-white transition-all appearance-none cursor-pointer font-light rounded-none"
                        >
                          {((ttsProvider === 'cartesia' ? CARTESIA_VOICES : SARVAM_VOICES)[selectedLanguage] || []).map((v) => (
                            <option key={v.id} value={v.id} className="bg-[#0A0A0A] text-white">
                              {v.label} ({v.gender})
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center text-zinc-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                </div>

                <div className="pt-8 flex justify-end mt-4 relative z-10">
                  <Button
                    onClick={handleStartSandbox}
                    disabled={!selectedModuleId || submittingCall || (agentSource === 'custom' && !user)}
                    className="w-full sm:w-auto px-6 h-9 bg-white text-black font-medium rounded-md text-[13px] hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-50 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                  >
                    Initiate Sandbox
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Connecting / Ringing Stage */}
        {stage === 'connecting' && (
          <div className="p-12 flex flex-col items-center justify-center h-[500px] space-y-6 relative z-10">
            <div className="relative">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full animate-ping absolute"></div>
              <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center relative">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-white mb-1">Bootstrapping Audio Pipeline</h3>
              <p className="text-xs text-zinc-400">Allocating Deepgram transcriptions and Gemini Flash systems...</p>
            </div>
          </div>
        )}

        {/* Active Connected Call Sandbox */}
        {stage === 'connected' && (
          <div className="flex flex-col h-[500px] relative z-10">
            {/* Call Status Indicator bar */}
            <div className="px-6 py-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                  LIVE INTERACTIVE CONNECTED
                </span>
              </div>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                8kHz G.711 μ-Law
              </span>
            </div>

            {/* Glowing Wave Animation Area */}
            <div className="flex-1 flex flex-col p-6 space-y-4 overflow-hidden relative">
              
              {/* Dynamic Sound Wave Pulse sphere */}
              <div className="flex flex-col items-center justify-center py-6 relative">
                <div className={`w-16 h-16 rounded-full bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center transition-transform duration-300 ${isAgentSpeaking ? 'scale-125 bg-emerald-500/20 border-emerald-400/30 shadow-[0_0_30px_rgba(16,185,129,0.2)]' : ''}`}>
                  <Mic className={`w-6 h-6 ${isMuted ? 'text-zinc-600' : 'text-emerald-400 animate-pulse'}`} />
                </div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2">
                  {isAgentSpeaking ? 'Agent Speaking...' : isMuted ? 'Microphone Muted' : 'Agent Listening (Barge-In Available)'}
                </span>
              </div>

              {/* Live transcript window */}
              <div className="flex-1 overflow-y-auto bg-black/40 border border-white/5 rounded-2xl p-4 space-y-3 flex flex-col relative z-10 backdrop-blur-md">
                {finalizedTranscripts.length === 0 && Object.keys(activePartials).length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-center p-6 text-zinc-500 text-sm font-light">
                    Start talking to the agent...
                  </div>
                ) : (
                  [...finalizedTranscripts, ...Object.values(activePartials)].map((line, idx) => (
                    <div 
                      key={idx} 
                      className={`flex flex-col max-w-[80%] ${line.source === 'ai' ? 'self-start items-start' : 'self-end items-end'}`}
                    >
                      <span className="text-[10px] font-medium text-zinc-500 mb-1 px-1">
                        {line.source === 'ai' ? 'Voice Agent' : customerName}
                      </span>
                      <div className={`px-4 py-2.5 rounded-2xl text-sm font-light leading-relaxed ${
                        line.source === 'ai' 
                          ? 'bg-white/5 border border-white/5 text-zinc-200 rounded-tl-sm' 
                          : 'bg-white text-black shadow-sm rounded-tr-sm'
                      } ${!line.isFinal ? 'opacity-70 italic' : ''}`}>
                        {line.text}
                      </div>
                    </div>
                  ))
                )}
                <div ref={transcriptEndRef} />
              </div>
            </div>

            {/* Active call footer controls */}
            <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between gap-4 relative z-10">
              <Button
                variant="outline"
                onClick={() => setIsMuted(!isMuted)}
                className={`h-9 px-4 rounded-full border-white/10 transition-all text-xs font-medium ${isMuted ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/20' : 'bg-white/5 text-white hover:bg-white/10'}`}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5 mr-1.5" /> : <Mic className="w-3.5 h-3.5 mr-1.5" />}
                {isMuted ? 'Muted' : 'Mute Mic'}
              </Button>

              <Button
                onClick={handleEndSandboxCall}
                className="h-9 px-5 bg-white hover:bg-zinc-200 text-black font-medium rounded-full text-[11px] uppercase tracking-wide transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(255,255,255,0.1)]"
              >
                <Square className="w-3.5 h-3.5" />
                END SESSION
              </Button>
            </div>
          </div>
        )}



      </div>
    </div>
  );
};
