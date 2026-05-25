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
    id: 'demo-agent-enthusiastic',
    name: 'Aarav (Enthusiastic Promoter)',
    emotion: 'Enthusiastic',
    description: 'High energy, fast-paced representative promoting premium plans with dynamic voice modulation.'
  },
  {
    id: 'demo-agent-calm',
    name: 'Ananya (Calm Corporate Advisor)',
    emotion: 'Calm/Professional',
    description: 'Steady, reassuring corporate advisor collecting processes and latency challenges.'
  },
  {
    id: 'demo-agent-feedback',
    name: 'Rohan (Feedback Collector)',
    emotion: 'Success Specialist',
    description: 'Friendly Success Agent seeking user reviews on IVR and phone line frustrations.'
  },
  {
    id: 'demo-agent-support',
    name: 'Kavya (Friendly Customer Support)',
    emotion: 'Friendly/Empathetic',
    description: 'Empathetic Customer Success agent resolving login and account issues.'
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
  const [customerName, setCustomerName] = useState<string>("Aditya");
  const [loadingModules, setLoadingModules] = useState<boolean>(false);
  const [submittingCall, setSubmittingCall] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en-US");
  const [selectedVoice, setSelectedVoice] = useState<string>("47c38ca4-5f35-497b-b1a3-415245fb35e1");
  const [ttsProvider, setTtsProvider] = useState<string>("cartesia");
  const [optimizeFor, setOptimizeFor] = useState<'latency' | 'quality'>('latency');

  // Sync selected voice list when selectedModuleId changes
  useEffect(() => {
    if (selectedModuleId && modules.length > 0) {
      const activeMod = modules.find(m => (m._id || m.id) === selectedModuleId);
      if (activeMod) {
        setSelectedVoice(activeMod.selectedVoice || "anushka");
        setSelectedLanguage(activeMod.selectedLanguage || "hi-IN");
      }
    }
  }, [selectedModuleId, modules]);

  // Adjust default voice if selected language or ttsProvider is manually overridden
  useEffect(() => {
    let availableVoices = [];
    if (ttsProvider === 'sarvam') {
      availableVoices = SARVAM_VOICES[selectedLanguage] || [];
    } else {
      availableVoices = CARTESIA_VOICES[selectedLanguage] || [];
    }

    if (availableVoices.length > 0) {
      const match = availableVoices.find(v => v.id === selectedVoice);
      if (!match) {
        setSelectedVoice(availableVoices[0].id);
      }
    }
  }, [selectedLanguage, ttsProvider]);
  
  // Active session state
  const [callRecord, setCallRecord] = useState<any>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState<boolean>(false);

  // Audio nodes and socket references
  const streamWsRef = useRef<WebSocket | null>(null);
  const liveCallWsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
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
      setTranscript([]);
      setCallRecord(null);
    }
  }, [open]);

  // Scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

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

  // Mu-law and PCM algorithms
  const linearToMuLaw = (sample: number): number => {
    const BIAS = 0x84;
    const CLIP = 32635;
    const sign = sample < 0 ? 0x80 : 0;
    if (sample < 0) sample = -sample;
    if (sample > CLIP) sample = CLIP;
    sample = (sample + BIAS) >> 0;

    let exponent = 7;
    for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; expMask >>= 1) {
      exponent--;
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    const byte = ~(sign | (exponent << 4) | mantissa);
    return byte & 0xff;
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

  const downsampleAndEncodeMulaw = (
    inputBuffer: Float32Array,
    inputSampleRate: number,
    outputSampleRate: number
  ): Uint8Array => {
    const compressionRatio = inputSampleRate / outputSampleRate;
    const outputLength = Math.round(inputBuffer.length / compressionRatio);
    const outputBuffer = new Uint8Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const inputIndex = Math.round(i * compressionRatio);
      let sample = inputBuffer[inputIndex];
      if (sample < -1) sample = -1;
      if (sample > 1) sample = 1;
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      outputBuffer[i] = linearToMuLaw(intSample);
    }
    return outputBuffer;
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
    source.onended = () => {
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
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const audioContext = audioContextRef.current;
      sourceNodeRef.current = audioContext.createMediaStreamSource(mediaStreamRef.current);
      
      // Processor node with mono channels
      processorNodeRef.current = audioContext.createScriptProcessor(2048, 1, 1);
      
      const inputSampleRate = audioContext.sampleRate;
      const outputSampleRate = 8000;

      processorNodeRef.current.onaudioprocess = (e) => {
        if (isMutedRef.current) return;
        const ws = streamWsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const compressedData = downsampleAndEncodeMulaw(inputData, inputSampleRate, outputSampleRate);
        const base64Audio = arrayBufferToBase64(compressedData.buffer);

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
    setTranscript([]);
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
            setTranscript((prev) => {
              const text = msg.text;
              const isFinal = msg.isFinal;
              const source = msg.source; // 'user' | 'ai'

              // Remove previous partials from same source
              const filtered = prev.filter(item => !(item.source === source && !item.isFinal));
              return [...filtered, { source, text, isFinal }];
            });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[92vh] bg-[#0A0A0A] border border-white/[0.08] rounded-2xl overflow-hidden shadow-2xl relative z-10 flex flex-col my-4 animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <h2 className="text-sm font-bold text-white uppercase tracking-widest">
              Voice Pipeline Sandbox
            </h2>
          </div>
          <button 
            onClick={onClose} 
            className="text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Setup Stage */}
        {stage === 'setup' && (
          <div className="p-6 sm:p-8 flex flex-col space-y-6 overflow-y-auto">
            <div className="text-center max-w-md mx-auto">
              <h3 className="text-xl font-semibold text-white mb-2">Test Your Voice Pipeline</h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Test conversation pathways, custom questions, and TTS configurations in real-time. No Twilio credits or hardware connectivity required.
              </p>
            </div>

            {loadingModules ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <span className="text-xs text-zinc-500">Retrieving modules...</span>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex bg-white/5 rounded-lg p-1 mb-4 border border-white/5">
                    <button
                      type="button"
                      onClick={() => {
                        setAgentSource('demo');
                        setSelectedModuleId('demo-agent-calm');
                      }}
                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                        agentSource === 'demo' ? 'bg-[#1A1A1A] text-white border border-white/10 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
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
                      className={`flex-1 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-all ${
                        agentSource === 'custom' ? 'bg-[#1A1A1A] text-white border border-white/10 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      Test Your Agent
                    </button>
                  </div>

                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                    Select Voice Agent
                  </label>

                  {agentSource === 'demo' ? (
                    <div className="space-y-3">
                      <div className="relative">
                        <select
                          value={selectedModuleId}
                          onChange={(e) => setSelectedModuleId(e.target.value)}
                          className="w-full h-10 bg-white/[0.03] border border-white/10 rounded-lg px-4 text-white text-sm focus:outline-none focus:border-white/30 transition-all appearance-none cursor-pointer font-medium"
                        >
                          {DEMO_AGENTS.map((d) => (
                            <option key={d.id} value={d.id} className="bg-[#0A0A0A] text-white">
                              {d.name}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
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
                          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl animate-in fade-in duration-300">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                {currentDemo.emotion}
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-400 leading-normal">{currentDemo.description}</p>
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
                            className="w-full h-10 bg-white/[0.03] border border-white/10 rounded-lg px-4 text-white text-sm focus:outline-none focus:border-white/30 transition-all appearance-none cursor-pointer"
                          >
                            {modules.map((m) => (
                              <option key={m._id || m.id} value={m._id || m.id} className="bg-[#0A0A0A] text-white">
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                    Your Name (Simulation)
                  </label>
                  <div className="relative flex items-center">
                    <User className="absolute left-3 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Aditiya"
                      className="w-full h-10 bg-white/[0.03] border border-white/10 rounded-lg pl-10 pr-4 text-white text-sm focus:outline-none focus:border-white/30 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                      Optimization Mode
                    </label>
                    <div className="flex bg-white/5 rounded-lg p-1 border border-white/5">
                      <button
                        type="button"
                        onClick={() => setOptimizeFor('latency')}
                        className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${
                          optimizeFor === 'latency' ? 'bg-[#1A1A1A] text-blue-400 border border-white/10 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                         Speed (Low Latency)
                      </button>
                      <button
                        type="button"
                        onClick={() => setOptimizeFor('quality')}
                        className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${
                          optimizeFor === 'quality' ? 'bg-[#1A1A1A] text-purple-400 border border-white/10 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                      >
                         Quality (Natural Flow)
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                      TTS Engine
                    </label>
                    <div className="relative">
                      <select
                        value={ttsProvider}
                        onChange={(e) => {
                          setTtsProvider(e.target.value);
                          if (e.target.value === 'cartesia') {
                            setSelectedLanguage('en-US');
                            setSelectedVoice('47c38ca4-5f35-497b-b1a3-415245fb35e1'); // Daniel
                          } else {
                            setSelectedLanguage('hi-IN');
                            setSelectedVoice('anushka');
                          }
                        }}
                        className="w-full h-10 bg-white/[0.03] border border-white/10 rounded-lg px-4 text-white text-sm focus:outline-none focus:border-white/30 transition-all appearance-none cursor-pointer font-semibold"
                      >
                        <option value="cartesia" className="bg-[#0A0A0A] text-white">Cartesia (English & Int.)</option>
                        <option value="sarvam" className="bg-[#0A0A0A] text-white">Sarvam AI (Indian Languages)</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                        Language Options Available
                      </label>
                      <div className="relative">
                        <select
                          value={selectedLanguage}
                          onChange={(e) => setSelectedLanguage(e.target.value)}
                          className="w-full h-10 bg-white/[0.03] border border-white/10 rounded-lg px-4 text-white text-sm focus:outline-none focus:border-white/30 transition-all appearance-none cursor-pointer font-semibold"
                        >
                          {(ttsProvider === 'sarvam' ? SARVAM_LANGUAGES : CARTESIA_LANGUAGES).map((l) => (
                            <option key={l.code} value={l.code} className="bg-[#0A0A0A] text-white font-semibold">
                              {l.label}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">
                        Voice Options Available
                      </label>
                      <div className="relative">
                        <select
                          value={selectedVoice}
                          onChange={(e) => setSelectedVoice(e.target.value)}
                          className="w-full h-10 bg-white/[0.03] border border-white/10 rounded-lg px-4 text-white text-sm focus:outline-none focus:border-white/30 transition-all appearance-none cursor-pointer font-semibold"
                        >
                          {((ttsProvider === 'sarvam' ? SARVAM_VOICES : CARTESIA_VOICES)[selectedLanguage] || []).map((v) => (
                            <option key={v.id} value={v.id} className="bg-[#0A0A0A] text-white font-semibold">
                              {v.label} ({v.gender})
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleStartSandbox}
                  disabled={!selectedModuleId || submittingCall || (agentSource === 'custom' && !user)}
                  className="w-full h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-full tracking-wider text-sm uppercase shadow-none transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 mt-4"
                >
                  <Play className="w-4 h-4 mr-2" />
                  INITIATE LIVE SANDBOX
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Connecting / Ringing Stage */}
        {stage === 'connecting' && (
          <div className="p-10 flex flex-col items-center justify-center space-y-6">
            <div className="relative">
              <div className="w-20 h-20 bg-blue-500/10 rounded-full animate-ping absolute"></div>
              <div className="w-20 h-20 bg-indigo-500/20 border border-white/10 rounded-full flex items-center justify-center relative">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-medium text-white mb-1">Bootstrapping Audio Pipeline</h3>
              <p className="text-xs text-zinc-500">Allocating Deepgram transcriptions and Gemini Flash systems...</p>
            </div>
          </div>
        )}

        {/* Active Connected Call Sandbox */}
        {stage === 'connected' && (
          <div className="flex flex-col h-[500px]">
            {/* Call Status Indicator bar */}
            <div className="px-6 py-3 bg-zinc-950/40 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-[10px] font-bold text-green-400 uppercase tracking-widest">
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
                <div className={`w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center transition-transform duration-300 ${isAgentSpeaking ? 'scale-125 bg-blue-500/20 border-blue-400/40 shadow-[0_0_30px_rgba(59,130,246,0.3)]' : ''}`}>
                  <Mic className={`w-6 h-6 ${isMuted ? 'text-zinc-600' : 'text-blue-400 animate-pulse'}`} />
                </div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest mt-2">
                  {isAgentSpeaking ? 'Agent Speaking...' : isMuted ? 'Microphone Muted' : 'Agent Listening (Barge-In Available)'}
                </span>
              </div>

              {/* Live transcript window */}
              <div className="flex-1 overflow-y-auto bg-zinc-950/60 border border-white/5 rounded-2xl p-4 space-y-3 flex flex-col">
                {transcript.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-center p-6 text-zinc-600 text-xs font-medium">
                    Please say hello to start speaking with the agent, or wait for the initial greeting.
                  </div>
                ) : (
                  transcript.map((line, idx) => (
                    <div 
                      key={idx} 
                      className={`flex flex-col max-w-[80%] ${line.source === 'ai' ? 'self-start items-start' : 'self-end items-end'}`}
                    >
                      <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest mb-1 px-1">
                        {line.source === 'ai' ? 'Voice Agent' : customerName}
                      </span>
                      <div className={`px-4 py-2.5 rounded-2xl text-xs leading-normal ${
                        line.source === 'ai' 
                          ? 'bg-zinc-900 border border-white/5 text-white' 
                          : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
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
            <div className="px-6 py-4 bg-zinc-950/40 border-t border-white/5 flex items-center justify-between gap-4">
              <Button
                variant="outline"
                onClick={() => setIsMuted(!isMuted)}
                className={`h-9 px-4 rounded-full border-white/10 transition-all text-xs font-semibold ${isMuted ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/20' : 'bg-white/5 text-white hover:bg-white/10'}`}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5 mr-1.5" /> : <Mic className="w-3.5 h-3.5 mr-1.5" />}
                {isMuted ? 'Muted' : 'Mute Mic'}
              </Button>

              <Button
                onClick={handleEndSandboxCall}
                className="h-9 px-5 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full text-[10px] sm:text-xs uppercase tracking-wider transition-all flex items-center gap-1.5"
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
