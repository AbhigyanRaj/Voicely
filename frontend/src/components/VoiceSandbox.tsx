import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Mic, MicOff, Play, Square, MessageSquare, Loader2, Shield, CheckCircle2, AlertCircle, Sparkles, User, RefreshCw, BarChart } from "lucide-react";
import { Button } from "./ui/button";
import { getUserModules, getStoredToken } from "../lib/auth";
import type { VoiceModule } from "../lib/auth";
import { getApiBaseUrl } from "../lib/api";
import { 
  SARVAM_LANGUAGES, 
  SARVAM_VOICES,
  DEEPGRAM_LANGUAGES,
  DEEPGRAM_VOICES,
  GOOGLE_LANGUAGES,
  GOOGLE_VOICES
} from "../lib/ttsConfig";

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
  const [stage, setStage] = useState<'setup' | 'connecting' | 'connected' | 'ended'>('setup');
  const [modules, setModules] = useState<VoiceModule[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>("");
  const [customerName, setCustomerName] = useState<string>("Aditya");
  const [loadingModules, setLoadingModules] = useState<boolean>(false);
  const [submittingCall, setSubmittingCall] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("hi-IN");
  const [selectedVoice, setSelectedVoice] = useState<string>("anushka");
  const [ttsProvider, setTtsProvider] = useState<string>("sarvam");

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
    } else if (ttsProvider === 'deepgram') {
      availableVoices = DEEPGRAM_VOICES[selectedLanguage] || [];
    } else {
      availableVoices = GOOGLE_VOICES[selectedLanguage] || [];
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
  
  // Post-call state
  const [pollingAnalysis, setPollingAnalysis] = useState<boolean>(false);
  const [analyzedCall, setAnalyzedCall] = useState<any>(null);

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
          if (fetched.length > 0) {
            setSelectedModuleId(fetched[0]._id || fetched[0].id || "");
          }
        } catch (err) {
          console.error("Failed to load modules for sandbox:", err);
        } finally {
          setLoadingModules(false);
        }
      };
      loadModules();
      
      // Reset state
      setStage('setup');
      setTranscript([]);
      setCallRecord(null);
      setAnalyzedCall(null);
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
  const playAudioChunk = (base64Payload: string) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    // Decode base64
    const binaryString = window.atob(base64Payload);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Convert mu-law to float32 linear
    const float32Data = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      float32Data[i] = muLawToLinear(bytes[i]);
    }

    // Play sequential chunks smoothly
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    // Wideband HD Voice 16kHz for sandbox testing
    const activeSampleRate = ttsProvider ? 16000 : 8000;
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

    try {
      const response = await fetch(`${getApiBaseUrl()}/calls/browser-sandbox`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          moduleId: selectedModuleId,
          customerName: customerName.trim(),
          selectedVoice,
          selectedLanguage,
          ttsProvider
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
            playAudioChunk(msg.media.payload);
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

  // Terminate active Sandbox call and poll for analysis
  const handleEndSandboxCall = async () => {
    if (!callRecord) return;
    
    setStage('ended');
    setPollingAnalysis(true);

    // Send final stop command
    if (streamWsRef.current && streamWsRef.current.readyState === WebSocket.OPEN) {
      streamWsRef.current.send(JSON.stringify({ event: 'stop' }));
    }

    cleanupSession();

    // Start polling DB call details to fetch Gemini transcript evaluations
    let attempts = 0;
    const token = getStoredToken();

    pollingIntervalRef.current = setInterval(async () => {
      attempts++;
      try {
        const response = await fetch(`${getApiBaseUrl()}/calls/${callRecord._id}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });

        if (response.ok) {
          const resData = await response.json();
          const call = resData.call;
          
          // Poll until Gemini evaluation results populate
          if (call.status === 'completed' || call.evaluation?.result) {
            setAnalyzedCall(call);
            setPollingAnalysis(false);
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
        }
      } catch (err) {
        console.error("Error polling post-call analysis:", err);
      }

      if (attempts >= 15) {
        setPollingAnalysis(false);
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }, 2000);
  };

  const logger = (msg: string) => {
    console.log(`[VoiceSandbox] ${msg}`);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 overflow-y-auto">
      {/* Dynamic Glow Accents */}
      <div className="absolute top-10 left-10 w-56 h-56 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-10 right-10 w-56 h-56 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-2xl max-h-[92vh] bg-gradient-to-br from-zinc-900 via-zinc-900 to-black border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative z-10 flex flex-col my-4">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-500 animate-pulse" />
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
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                    Select Voice Agent
                  </label>
                  {modules.length === 0 ? (
                    <div className="p-4 bg-zinc-950/40 border border-white/5 rounded-xl text-center">
                      <AlertCircle className="w-5 h-5 text-amber-500 mx-auto mb-2" />
                      <p className="text-xs text-zinc-500">No active Voice Agents found. Please create a module first.</p>
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        value={selectedModuleId}
                        onChange={(e) => setSelectedModuleId(e.target.value)}
                        className="w-full h-11 bg-zinc-950/60 border border-white/10 rounded-xl px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all appearance-none cursor-pointer"
                      >
                        {modules.map((m) => (
                          <option key={m._id || m.id} value={m._id || m.id} className="bg-zinc-900 text-white">
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2">
                    Your Name (Simulation)
                  </label>
                  <div className="relative flex items-center">
                    <User className="absolute left-4 w-4 h-4 text-zinc-600" />
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Aditiya"
                      className="w-full h-11 bg-zinc-950/60 border border-white/10 rounded-xl pl-11 pr-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                      TTS Engine
                    </label>
                    <div className="h-10 bg-zinc-950/40 border border-white/5 rounded-xl px-4 flex items-center text-zinc-300 text-xs font-semibold select-none">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2 animate-pulse"></div>
                      Sarvam AI (Regional Indian Languages)
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                        Language Override
                      </label>
                      <div className="relative">
                        <select
                          value={selectedLanguage}
                          onChange={(e) => setSelectedLanguage(e.target.value)}
                          className="w-full h-10 bg-zinc-950/60 border border-white/10 rounded-xl px-4 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all appearance-none cursor-pointer font-semibold"
                        >
                          {SARVAM_LANGUAGES.map((l) => (
                            <option key={l.code} value={l.code} className="bg-zinc-900 text-white font-semibold">
                              {l.label}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                        Voice Override
                      </label>
                      <div className="relative">
                        <select
                          value={selectedVoice}
                          onChange={(e) => setSelectedVoice(e.target.value)}
                          className="w-full h-10 bg-zinc-950/60 border border-white/10 rounded-xl px-4 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all appearance-none cursor-pointer font-semibold"
                        >
                          {(SARVAM_VOICES[selectedLanguage] || []).map((v) => (
                            <option key={v.id} value={v.id} className="bg-zinc-900 text-white font-semibold">
                              {v.label} ({v.gender})
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-zinc-400">
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
                  disabled={modules.length === 0 || submittingCall}
                  className="w-full h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-full tracking-wider text-xs uppercase shadow-[0_8px_24px_-8px_rgba(59,130,246,0.5)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 mt-2"
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
                END & ANALYZE SESSION
              </Button>
            </div>
          </div>
        )}

        {/* Post-Call Analysis Report Stage */}
        {stage === 'ended' && (
          <div className="p-6 sm:p-8 flex flex-col space-y-6 max-h-[550px] overflow-y-auto">
            {pollingAnalysis ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-4">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <div className="text-center">
                  <h3 className="text-sm font-semibold text-white mb-1">Performing Gemini Analysis</h3>
                  <p className="text-[11px] text-zinc-500">Evaluating responses and intent thresholds...</p>
                </div>
              </div>
            ) : analyzedCall ? (
              <div className="space-y-6">
                
                {/* Call Analytics Header Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 bg-zinc-950/50 border border-white/5 rounded-2xl text-center">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                      Qualification Result
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block ${
                      ['YES', 'INTERESTED', 'QUALIFIED'].includes(analyzedCall.evaluation?.result)
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {analyzedCall.evaluation?.result || 'N/A'}
                    </span>
                  </div>

                  <div className="p-4 bg-zinc-950/50 border border-white/5 rounded-2xl text-center">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                      Sentiment
                    </span>
                    <span className="text-[10px] font-bold text-blue-400">
                      {analyzedCall.evaluation?.analysis?.sentiment || 'Neutral'}
                    </span>
                  </div>

                  <div className="p-4 bg-zinc-950/50 border border-white/5 rounded-2xl text-center">
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block mb-1">
                      Duration
                    </span>
                    <span className="text-[10px] font-bold text-white">
                      {analyzedCall.duration || 0}s
                    </span>
                  </div>
                </div>

                {/* Post-Call Intelligent Summary */}
                <div className="p-4 bg-zinc-950/50 border border-white/5 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2 text-zinc-300 font-semibold text-xs">
                    <Sparkles className="w-4 h-4 text-blue-500" />
                    Intelligent Gemini Summary
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    {analyzedCall.summary || "No post-call summary generated."}
                  </p>
                </div>

                {/* Question-Answer Responses Extracted */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                    Extracted Lead Answers
                  </span>
                  
                  {Object.keys(analyzedCall.responses || {}).length === 0 ? (
                    <div className="p-4 bg-zinc-950/40 border border-white/5 rounded-2xl text-center text-xs text-zinc-500 font-medium">
                      No matching answer responses extracted from this conversation.
                    </div>
                  ) : (
                    <div className="bg-zinc-950/40 border border-white/5 rounded-2xl overflow-hidden divide-y divide-white/5">
                      {Object.entries(analyzedCall.responses).map(([question, answer]: any, idx) => (
                        <div key={idx} className="p-4 flex flex-col space-y-1">
                          <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-widest">
                            Q: {question}
                          </span>
                          <span className="text-xs text-white font-medium">
                            A: {answer || 'No answer extracted'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button
                    onClick={() => setStage('setup')}
                    className="flex-1 h-10 bg-white/5 hover:bg-white/10 text-white font-bold rounded-full text-xs uppercase tracking-wider transition-all border border-white/10"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Restart Simulation
                  </Button>
                  <Button
                    onClick={onClose}
                    className="flex-1 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-full text-xs uppercase tracking-wider transition-all shadow-[0_8px_24px_-8px_rgba(59,130,246,0.5)]"
                  >
                    Exit Sandbox
                  </Button>
                </div>

              </div>
            ) : (
              <div className="p-10 flex flex-col items-center justify-center space-y-3">
                <AlertCircle className="w-8 h-8 text-amber-500" />
                <span className="text-xs text-zinc-500 text-center leading-relaxed">
                  We encountered a slight delay retrieving the analysis from MongoDB. You can find the full transcript and Gemini qualification inside the Lead Timeline or Analytics tab.
                </span>
                <Button onClick={() => setStage('setup')} className="h-9 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-full mt-2 text-xs font-semibold">
                  Restart Sandbox
                </Button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
