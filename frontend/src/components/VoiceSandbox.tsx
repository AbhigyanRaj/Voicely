import React, { useState, useEffect, useRef } from "react";
import { X, Mic, MicOff, Square, Loader2, Shield, AlertCircle, ChevronDown, Check } from "lucide-react";
import { getUserModules, getStoredToken } from "../lib/auth";
import type { VoiceModule } from "../lib/auth";
import { getApiBaseUrl, getWsBaseUrl } from "../lib/api";
import { decodeAudioPayload } from "../lib/audioUtils";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { CARTESIA_VOICES, DEFAULT_VOICE_ID, DEFAULT_LANGUAGE, TTS_PROVIDER } from "../lib/ttsConfig";

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

/** Guest sessions are capped server-side too; this is the display countdown. */
const SANDBOX_SECONDS = 60;

interface VoiceSandboxProps {
  open: boolean;
  onClose: () => void;
}

interface TranscriptLine {
  source: 'ai' | 'user';
  text: string;
  isFinal: boolean;
}

/**
 * In-progress capture setup. The context exists immediately; the stream and the
 * worklet module are still in flight.
 */
interface MicCapture {
  context: AudioContext;
  stream: Promise<MediaStream>;
  worklet: Promise<void>;
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
  const [selectedVoice, setSelectedVoice] = useState<string>(DEFAULT_VOICE_ID);
  // Provider and language are fixed: Cartesia, English.
  const selectedLanguage = DEFAULT_LANGUAGE;
  const ttsProvider = TTS_PROVIDER;
  // No UI control sets this today; it is still sent to the server, where
  // 'quality' stops the TTS chunker splitting on commas.
  const [optimizeFor] = useState<'latency' | 'quality'>('latency');
  const [mobileStep, setMobileStep] = useState<1 | 2>(1);
  const [timeLeft, setTimeLeft] = useState<number>(SANDBOX_SECONDS);
  // Surfaced in the panel instead of alert(), which blocks the whole tab.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Custom agents may carry a saved voice; fall back to the default if it is not
  // one of the voices actually on offer.
  useEffect(() => {
    if (agentSource === 'custom' && modules.length > 0) {
      const activeMod = modules.find(m => (m._id || m.id) === selectedModuleId);
      if (activeMod?.selectedVoice) setSelectedVoice(activeMod.selectedVoice);
    }
  }, [selectedModuleId, modules, agentSource]);

  useEffect(() => {
    const available = CARTESIA_VOICES[DEFAULT_LANGUAGE] || [];
    if (!available.some(v => v.id === selectedVoice)) {
      setSelectedVoice(available[0]?.id ?? DEFAULT_VOICE_ID);
    }
  }, [selectedVoice]);

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
  const isMutedRef = useRef(isMuted);

  // Mic capture is started in parallel with session setup, so it has to be
  // awaited before the audio graph can be wired to the socket.
  const micWarmupRef = useRef<MicCapture | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  // Client-side latency samples, reported once at session end. Both ends of the
  // pipeline are invisible to the server, so without these the recorded budget
  // is missing the capture buffer and the playback jitter buffer.
  const clientMetricsRef = useRef<Record<string, number[]>>({});
  const readyAtRef = useRef<number | null>(null);
  const firstPlayoutRecordedRef = useRef<boolean>(false);

  const recordClientMetric = (name: string, value: number) => {
    if (!Number.isFinite(value) || value < 0) return;
    const samples = clientMetricsRef.current[name] || (clientMetricsRef.current[name] = []);
    // Report the median at the end; a cap keeps this from growing unbounded.
    if (samples.length < 500) samples.push(value);
  };

  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; }, [open]);
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
      setMobileStep(1);
      setTimeLeft(SANDBOX_SECONDS);
      setErrorMessage(null);
      setFinalizedTranscripts([]);
      setActivePartials({});
      }
  }, [open]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [finalizedTranscripts, activePartials]);

  // `timeLeft` deliberately stays out of the dependency list: including it tore
  // down and recreated this interval on every single tick.
  useEffect(() => {
    if (stage !== 'connected') return;
    const interval = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [stage]);

  // The countdown used to just sit at 00:00 with the session still live.
  useEffect(() => {
    if (stage === 'connected' && timeLeft === 0) {
      setErrorMessage("Your 60-second sandbox session has ended. Sign in for longer sessions.");
      handleEndSandboxCall();
    }
  }, [stage, timeLeft]);

  useEffect(() => { return () => cleanupSession(); }, []);

  const cleanupSession = () => {
    // Hand the client-side timings over before the socket goes away.
    reportClientMetrics();

    if (streamWsRef.current) { streamWsRef.current.close(); streamWsRef.current = null; }
    if (liveCallWsRef.current) { liveCallWsRef.current.close(); liveCallWsRef.current = null; }
    if (workletNodeRef.current) { workletNodeRef.current.port.onmessage = null; workletNodeRef.current.disconnect(); workletNodeRef.current = null; }
    if (processorNodeRef.current) { processorNodeRef.current.disconnect(); processorNodeRef.current = null; }
    if (sourceNodeRef.current) { sourceNodeRef.current.disconnect(); sourceNodeRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close(); audioContextRef.current = null; }

    // A capture still in flight would otherwise leave the mic open forever:
    // the permission prompt can resolve long after the user gave up.
    if (micWarmupRef.current) {
      const pending = micWarmupRef.current;
      micWarmupRef.current = null;
      pending.stream
        .then(stream => stream.getTracks().forEach(t => t.stop()))
        .catch(() => {});
      pending.context.close().catch(() => {});
    }

    activeAudioNodesRef.current = [];
    nextStartTimeRef.current = 0;
    readyAtRef.current = null;
    firstPlayoutRecordedRef.current = false;
  };

  /** Median of each client metric, posted to the server in one message. */
  const reportClientMetrics = () => {
    const ws = streamWsRef.current;
    const samples = clientMetricsRef.current;
    clientMetricsRef.current = {};
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const metrics: Record<string, number> = {};
    for (const [name, values] of Object.entries(samples)) {
      if (values.length === 0) continue;
      const sorted = [...values].sort((a, b) => a - b);
      metrics[name] = sorted[Math.floor(sorted.length / 2)];
    }
    if (Object.keys(metrics).length === 0) return;

    try {
      ws.send(JSON.stringify({ event: 'client_metrics', metrics }));
    } catch {
      // The socket closed under us; these are diagnostics, so drop them.
    }
  };

  // Jitter buffer ahead of the first chunk of an utterance. 20ms rather than
  // 50ms, which is safe now that mic frames are ~20ms instead of 256ms.
  const PLAYOUT_LEAD_SECONDS = 0.02;

  const playAudioChunk = (base64Payload: string, encoding = 'mulaw', sampleRate = 8000) => {
    const ac = audioContextRef.current;
    if (!ac) return;

    const float32Data = decodeAudioPayload(base64Payload, encoding);
    if (float32Data.length === 0) return;

    if (ac.state === "suspended") ac.resume();
    const buf = ac.createBuffer(1, float32Data.length, sampleRate);
    buf.getChannelData(0).set(float32Data);
    const source = ac.createBufferSource();
    source.buffer = buf;
    source.connect(ac.destination);

    const now = ac.currentTime;
    if (nextStartTimeRef.current < now) nextStartTimeRef.current = now + PLAYOUT_LEAD_SECONDS;

    // How far ahead of the clock we are scheduling: the real jitter-buffer depth.
    recordClientMetric('playout_depth_ms', (nextStartTimeRef.current - now) * 1000);
    if (!firstPlayoutRecordedRef.current && readyAtRef.current !== null) {
      firstPlayoutRecordedRef.current = true;
      recordClientMetric('ready_to_first_playout_ms', performance.now() - readyAtRef.current);
    }

    setIsAgentSpeaking(true);
    activeAudioNodesRef.current.push(source);
    source.onended = () => {
      activeAudioNodesRef.current = activeAudioNodesRef.current.filter(n => n !== source);
      if (ac.currentTime >= nextStartTimeRef.current - 0.08) setIsAgentSpeaking(false);
    };
    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += buf.duration;
  };

  /**
   * Begin capture setup without blocking on it.
   *
   * The AudioContext is created synchronously, so its sample rate -- which the
   * server needs in order to configure STT -- is known immediately. Only
   * getUserMedia needs the permission prompt, and that is left as a promise the
   * caller awaits later, so session setup and the permission dialog overlap
   * instead of running one after the other.
   *
   * Previously all of this ran only after the server said `ready`, which put the
   * permission prompt -- often the longest single item in a cold start -- dead
   * last, behind an already-billing Deepgram socket.
   */
  const beginCapture = (): MicCapture => {
    // No sampleRate override: the context runs at the hardware's native rate, so
    // the browser does no resampling. Pinning it to 8000 forced telephony-grade
    // audio on the demo and is outright rejected by Safari and Firefox.
    const context: AudioContext = new (window.AudioContext ||
      (window as any).webkitAudioContext)({ latencyHint: 'interactive' });

    const stream = navigator.mediaDevices.getUserMedia({
      audio: {
        // The mic chain is connected to the speakers, so without these the
        // agent's own voice can trip the barge-in detector and cost a full turn.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // Fetched in parallel with the permission prompt.
    const worklet = context.audioWorklet.addModule('/audio-processor.js');

    return { context, stream, worklet };
  };

  /** Wire a warmed-up capture chain to the already-open socket. */
  const attachAudioStreaming = async () => {
    try {
      const capture = micWarmupRef.current;
      if (!capture) return;
      const { context } = capture;
      const [stream] = await Promise.all([capture.stream, capture.worklet]);
      micWarmupRef.current = null;

      // The user may have closed the modal while the prompt was up.
      if (!openRef.current) {
        stream.getTracks().forEach(t => t.stop());
        context.close().catch(() => {});
        return;
      }

      mediaStreamRef.current = stream;
      audioContextRef.current = context;
      if (context.state === 'suspended') await context.resume();

      const sourceNode = context.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      const worklet = new AudioWorkletNode(context, 'audio-processor');
      workletNodeRef.current = worklet;
      processorNodeRef.current = worklet;

      worklet.port.onmessage = (e: MessageEvent) => {
        const data = e.data;
        if (!data || data.type !== 'audio') return;
        if (isMutedRef.current) return;
        const ws = streamWsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        // Raw binary. The base64-in-JSON envelope this used to build is Twilio's
        // protocol, and the browser is not Twilio: it cost 36% more bytes plus a
        // per-byte string concat on the main thread for every frame.
        ws.send(data.buffer);

        if (typeof data.capturedAt === 'number') {
          // Time from the end of the captured frame to it hitting the socket.
          recordClientMetric(
            'capture_to_send_ms',
            Math.max(0, (context.currentTime - data.capturedAt) * 1000)
          );
        }
      };

      sourceNode.connect(worklet);
      // Keeps the worklet pulled by the graph. It writes nothing to its outputs,
      // so this is silent.
      worklet.connect(context.destination);
    } catch (err) {
      console.error("Mic capture failed:", err);
      setErrorMessage("Couldn't access your microphone. Allow mic permissions and try again.");
      setStage('setup');
      cleanupSession();
    }
  };

  const handleStartSandbox = async () => {
    if (!selectedModuleId || !customerName.trim()) {
      setErrorMessage("Please choose a voice agent and enter your name.");
      return;
    }
    setSubmittingCall(true);
    setStage('connecting');
    setErrorMessage(null);
    setFinalizedTranscripts([]);
    setActivePartials({});
    clientMetricsRef.current = {};
    firstPlayoutRecordedRef.current = false;

    // Kick the mic permission prompt and the worklet fetch off now, so they
    // overlap the HTTP round trip and the WebSocket handshake instead of waiting
    // for the server to say `ready`. Rejections are handled where they are
    // awaited, in attachAudioStreaming.
    let capture: MicCapture | null = null;
    try {
      capture = beginCapture();
      micWarmupRef.current = capture;
      capture.stream.catch(() => {});
      capture.worklet.catch(() => {});
    } catch (err) {
      console.error('Could not create an audio context:', err);
      setErrorMessage("Your browser blocked audio playback. Try a different browser.");
      setStage('setup');
      setSubmittingCall(false);
      return;
    }

    const token = getStoredToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    try {
      const response = await fetch(`${getApiBaseUrl()}/calls/browser-sandbox`, {
        method: "POST", headers,
        body: JSON.stringify({ moduleId: selectedModuleId, customerName: customerName.trim(), selectedVoice, selectedLanguage, ttsProvider, optimizeFor })
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.message || detail.error || `Server returned ${response.status}`);
      }
      const resData = await response.json();
      const call = resData.call;

      // One source of truth for the WS host. The old inline version rewrote any
      // host carrying a port to `localhost:5001` -- so a preview build on :4173,
      // or any deployment on an explicit port, pointed at the developer's laptop.
      const wsBase = getWsBaseUrl();

      // Read straight off the context. Awaiting the mic promise here would put
      // the permission prompt back on the critical path -- and if getUserMedia
      // never settles, the socket would never open at all.
      const captureRate = capture.context.sampleRate;

      const streamParams = new URLSearchParams({ sampleRate: String(captureRate) });
      const liveCallParams = new URLSearchParams({ callId: call._id });
      const tok = getStoredToken();
      if (tok) {
        streamParams.set('token', tok);
        liveCallParams.set('token', tok);
      }
      const streamWsUrl = `${wsBase}/api/streams/browser?${streamParams}`;
      const liveCallWsUrl = `${wsBase}/live-call?${liveCallParams}`;

      const streamWs = new WebSocket(streamWsUrl);
      streamWs.binaryType = 'arraybuffer';
      streamWsRef.current = streamWs;
      streamWs.onopen = () => {
        streamWs.send(JSON.stringify({ event: "start", start: { callSid: call.twilioCallSid, streamSid: "browser_stream_" + Date.now() } }));
      };
      streamWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'ready') {
            readyAtRef.current = performance.now();
            setStage('connected');
            setTimeLeft(SANDBOX_SECONDS);
            attachAudioStreaming();
          } else if (msg.event === "media") {
            playAudioChunk(msg.media.payload, msg.media.encoding, msg.media.sampleRate);
          } else if (msg.event === "clear") {
            activeAudioNodesRef.current.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
            activeAudioNodesRef.current = [];
            // Reset to the clock, not to zero: zero is in the past, so the very
            // next chunk was always scheduled late by the lead time.
            const ac = audioContextRef.current;
            nextStartTimeRef.current = ac ? ac.currentTime : 0;
            setIsAgentSpeaking(false);
          } else if (msg.event === "error") {
            // Previously the server logged init failures and told the client
            // nothing, so the modal sat on "Setting up the sandbox" forever.
            console.error("Pipeline error:", msg.message);
            setErrorMessage(msg.message || "The voice pipeline failed to start.");
            setStage('setup');
            cleanupSession();
          } else if (msg.event === "end") {
            handleEndSandboxCall();
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
              // Server-side partials are cumulative: STT resends the whole
              // utterance so far, and the AI stream is now coalesced into the
              // sentence so far rather than one token per message. Replacing is
              // therefore correct -- appending here would duplicate the text.
              setActivePartials(prev => ({ ...prev, [source]: { source, text, isFinal: false } }));
            }
          }
        } catch (err) { console.error("Transcript error:", err); }
      };
      // This socket had no error or close handler at all, so a dropped
      // transcript feed was invisible.
      liveCallWs.onerror = (e) => console.error("Transcript socket error:", e);
      liveCallWs.onclose = () => { liveCallWsRef.current = null; };
    } catch (err: any) {
      console.error("Sandbox init error:", err);
      setErrorMessage(err?.message ? `Couldn't start the sandbox: ${err.message}` : "Couldn't start the sandbox.");
      setStage('setup');
      cleanupSession();
    } finally {
      setSubmittingCall(false);
    }
  };

  const stopAudioStreaming = () => {
    if (workletNodeRef.current) { workletNodeRef.current.port.onmessage = null; workletNodeRef.current.disconnect(); workletNodeRef.current = null; }
    if (processorNodeRef.current) { processorNodeRef.current.disconnect(); processorNodeRef.current = null; }
    if (sourceNodeRef.current) { sourceNodeRef.current.disconnect(); sourceNodeRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
    setIsAgentSpeaking(false);
  };

  const handleEndSandboxCall = async () => {
    // No `if (!callRecord) return` guard: that early return meant closing during
    // 'connecting' never reached cleanupSession(), leaving the mic live and both
    // sockets open.
    setStage('setup');
    if (streamWsRef.current && streamWsRef.current.readyState === WebSocket.OPEN) {
      // Hand over the client-side timings before asking the server to wrap up.
      reportClientMetrics();
      streamWsRef.current.send(JSON.stringify({ event: 'stop' }));
    }
    cleanupSession();
  };

  const handleCloseModal = () => {
    if (stage === 'connected' || stage === 'connecting') {
      handleEndSandboxCall();
    }
    onClose();
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!open) return null;

  const currentDemoAgent = DEMO_AGENTS.find(d => d.id === selectedModuleId);
  const voices = CARTESIA_VOICES[DEFAULT_LANGUAGE] || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="w-full max-w-4xl bg-white border border-zinc-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200 md:h-[560px] max-h-[90vh]"
      >
        <button 
          onClick={handleCloseModal} 
          className="absolute top-4 right-4 z-50 text-zinc-400 hover:text-zinc-700 focus:outline-none p-1.5 rounded-full hover:bg-zinc-100 transition-all"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── SETUP ── */}
        {stage === 'setup' && (
          <div className="flex flex-col md:flex-row flex-1 h-full overflow-y-auto md:overflow-hidden">
            {/* Left: Agent Selection */}
            <div className={`w-full md:w-[45%] border-b md:border-b-0 md:border-r border-zinc-200 bg-[#F9FAFB] flex-col relative shrink-0 md:h-full ${mobileStep === 1 ? 'flex' : 'hidden md:flex'}`}>
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

              <div className="flex-1 overflow-visible md:overflow-y-auto px-6 pb-6 custom-scrollbar relative z-10">
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
                        <button onClick={() => { onClose(); navigate('/modules'); }} className="px-4 py-2 bg-[#0044FF] hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-all mt-2">
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
                        <button onClick={() => { onClose(); navigate('/modules'); }} className="px-4 py-2 bg-[#0044FF] hover:bg-blue-700 text-white text-[11px] font-bold rounded-lg transition-all mt-2">
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

              {/* Mobile Next Button */}
              <div className="md:hidden mt-auto p-4 border-t border-zinc-200 bg-white shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-20">
                <button
                  onClick={() => setMobileStep(2)}
                  disabled={!selectedModuleId || (agentSource === 'custom' && !user)}
                  className="w-full h-10 bg-zinc-900 hover:bg-black disabled:opacity-50 text-white text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2"
                >
                  Next Step
                </button>
              </div>
            </div>

            {/* Right: Settings & CTA */}
            <div className={`flex-col p-6 md:p-8 bg-white relative shrink-0 md:flex-1 md:overflow-y-auto custom-scrollbar ${mobileStep === 2 ? 'flex' : 'hidden md:flex'}`}>
              <div className="relative z-10">
                <button 
                  onClick={() => setMobileStep(1)} 
                  className="md:hidden flex items-center gap-1 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-6 hover:text-zinc-800 transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5 rotate-90" />
                  Back to Agents
                </button>
                <h3 className="text-[15px] font-bold text-zinc-900 mb-1 tracking-tight">Simulation Parameters</h3>
                <p className="text-zinc-500 text-[11px] mb-8">Configure the environment for your test call.</p>

                {errorMessage && (
                  <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <p className="text-[11px] font-medium leading-relaxed text-amber-800">{errorMessage}</p>
                  </div>
                )}
                
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

                  {/* Voice. Language is not a choice: the pipeline is English only. */}
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
                  disabled={!selectedModuleId || submittingCall || (agentSource === 'custom' && !user)}
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
                <h3 className="text-[13px] font-bold text-zinc-900 tracking-tight">Setting up the sandbox for you...</h3>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Waking up the Agent</p>
              </div>
            </div>
          </div>
        )}

        {/* ── CONNECTED ── */}
        {stage === 'connected' && (
          <div className="flex flex-col md:flex-row flex-1 h-full bg-white overflow-y-auto md:overflow-hidden">
            {/* Left: Orb & Controls */}
            <div className="w-full md:w-[40%] border-b md:border-b-0 md:border-r border-zinc-200 bg-[#F9FAFB] flex flex-col items-center justify-between p-6 relative shrink-0">
              
              <div className="w-full flex items-center justify-between z-10">
                <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-white border border-zinc-200 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)] animate-pulse" />
                  <span className="text-[9px] font-bold text-zinc-900 uppercase tracking-widest">Live</span>
                </div>
                <div className={`px-2.5 py-1 rounded-md border shadow-sm flex items-center transition-colors ${timeLeft <= 10 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-zinc-200 text-zinc-600'}`}>
                  <span className="text-[10px] font-bold tracking-widest font-mono">
                    {formatTime(timeLeft)}
                  </span>
                </div>
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
            <div className="flex-1 flex flex-col bg-white relative min-h-[300px] md:min-h-0 shrink-0">
              <div className="px-6 py-4 border-b border-zinc-200">
                <h4 className="text-[13px] font-bold text-zinc-900 tracking-tight">Live Transcript</h4>
              </div>

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-5">
                {finalizedTranscripts.length === 0 && Object.keys(activePartials).length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center">
                    <div className="relative flex items-center justify-center w-12 h-12 mb-4">
                      <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-10"></div>
                      <div className="relative bg-zinc-50 border border-zinc-200 rounded-full p-3 shadow-sm">
                        <Mic className="w-4 h-4 text-blue-600" />
                      </div>
                    </div>
                    <p className="text-[13px] font-bold text-zinc-900 tracking-tight mb-1">Connection established</p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">Say hello to begin</p>
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
