import React, { useState, useEffect, useRef } from "react";
import { X, Mic, MicOff, Square, Loader2, Shield, AlertCircle, ChevronDown, Check } from "lucide-react";
import { getUserModules, getStoredToken } from "../lib/auth";
import type { VoiceModule } from "../lib/auth";
import { getApiBaseUrl, getWsBaseUrl } from "../lib/api";
import { decodeAudioPayload } from "../lib/audioUtils";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { CARTESIA_VOICES, LANGUAGES, DEFAULT_VOICE_ID, DEFAULT_LANGUAGE, TTS_PROVIDER,
         defaultVoiceFor, usesDevanagari } from "../lib/ttsConfig";

/**
 * The agents a visitor can try. Must stay in step with
 * `backend/src/config/demoAgents.js` — the ids are the contract.
 *
 * These replace four English sales personas. Each one now proves something a
 * lender cares about, in a language their borrowers actually speak.
 */
/**
 * What the call is about. Language is a separate choice — these work in any of
 * them.
 *
 * Ids must match `backend/src/config/demoAgents.js`. They used to encode a
 * language (`demo-agent-hindi-reminder`), which is what made picking a language
 * do nothing: the agent's own language always won.
 */
export const DEMO_AGENTS = [
  {
    id: 'demo-agent-emi-reminder',
    name: 'EMI reminder',
    role: 'The core call',
    description: 'A borrower a few days past due. Ask when they can pay.',
  },
  {
    id: 'demo-agent-dispute',
    name: 'Disputed amount',
    role: 'Stops collecting',
    description: 'Say you already paid. It should take details, not argue.',
  },
  {
    id: 'demo-agent-hardship',
    name: 'Hardship',
    role: 'Escalates',
    description: 'Say you lost your job. It must stop asking and hand off.',
  },
];

/**
 * One-click things to try, each proving one specific thing.
 *
 * The sandbox used to open on a blank transcript with no suggestion of what to
 * say, which leaves a visitor to invent a test -- and most invent "hello, how
 * are you", which proves nothing a chatbot could not do. These are the four
 * questions someone is actually asking when they try a voice agent.
 */
export const SCENARIOS = [
  {
    id: 'promise',
    label: 'Promise a date',
    proves: 'The core outcome',
    say: 'Salary comes on the 18th, I will pay then.',
    hint: 'Watch it resolve "the 18th" into an actual date you can chase.',
  },
  {
    id: 'dispute',
    label: 'Say you already paid',
    proves: 'Stops collecting',
    say: 'I already paid this on the 2nd, check again.',
    hint: 'It should take the details and hand off, never argue.',
  },
  {
    id: 'hardship',
    label: 'Say you lost your job',
    proves: 'Compliance',
    say: 'I lost my job last month, I cannot pay right now.',
    hint: 'It must stop asking for money and escalate to a person.',
  },
  {
    id: 'interrupt',
    label: 'Interrupt it',
    proves: 'Barge-in',
    say: 'Sorry, can I stop you there for a second.',
    hint: 'Cut in while it is mid-sentence. It should stop immediately.',
  },
] as const;

/**
 * Which scenarios an utterance counts as an attempt at.
 *
 * Matched on content words rather than the exact sentence: nobody reads a prompt
 * card out verbatim, and a checklist that only ticks for a word-perfect recital
 * would never tick at all. Short words are dropped because "the" and "you" match
 * everything and distinguish nothing.
 */
export function matchedScenarios(spoken: string): string[] {
  const said = (spoken || '').toLowerCase();
  if (!said.trim()) return [];

  return SCENARIOS.filter(scenario => {
    const keywords = scenario.say
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);
    if (keywords.length === 0) return false;
    const hits = keywords.filter(w => said.includes(w)).length;
    return hits >= Math.min(2, keywords.length);
  }).map(s => s.id);
}

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
  /** Which turn produced this line; the latency badge is matched on it. */
  turnId?: number;
}

/** Server-reported timing for one agent reply. */
interface TurnLatency {
  ms: number;
  stages: { think: number; speak: number } | null;
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

/**
 * Above this RMS the frame is speech rather than room tone. Calibrated against a
 * quiet room (~0.002) and normal speech at arm's length (~0.05).
 */
const SPEECH_RMS = 0.02;

type MicCheckState = 'idle' | 'requesting' | 'listening' | 'heard' | 'silent' | 'denied';

/**
 * Live confirmation that the microphone works, before a session is started.
 *
 * A muted or wrong input device is the most common way the sandbox fails, and
 * its symptom -- the agent never responds -- is indistinguishable from the
 * product being broken. This runs the same capture graph the session uses, so a
 * pass here means the session will hear the user too.
 */
function useMicCheck() {
  const [state, setState] = useState<MicCheckState>('idle');
  const [level, setLevel] = useState(0);
  const teardownRef = useRef<(() => void) | null>(null);

  const stop = React.useCallback(() => {
    teardownRef.current?.();
    teardownRef.current = null;
    setLevel(0);
    setState(prev => (prev === 'listening' || prev === 'requesting' ? 'idle' : prev));
  }, []);

  const start = React.useCallback(async () => {
    teardownRef.current?.();
    setState('requesting');
    setLevel(0);

    let context: AudioContext | null = null;
    let stream: MediaStream | null = null;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

    const teardown = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      stream?.getTracks().forEach(t => t.stop());
      if (context && context.state !== 'closed') context.close().catch(() => {});
    };

    try {
      context = new (window.AudioContext || (window as any).webkitAudioContext)();
      const [grantedStream] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        }),
        context.audioWorklet.addModule('/audio-processor.js'),
      ]);
      stream = grantedStream;

      const node = new AudioWorkletNode(context, 'audio-processor');
      node.port.onmessage = (e: MessageEvent) => {
        if (e.data?.type !== 'audio' || typeof e.data.rms !== 'number') return;
        setLevel(e.data.rms);
        if (e.data.rms >= SPEECH_RMS) {
          if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
          setState('heard');
        }
      };
      context.createMediaStreamSource(stream).connect(node);
      node.connect(context.destination);

      teardownRef.current = () => { node.port.onmessage = null; teardown(); };
      setState('listening');

      // Nothing at all after a few seconds is a muted or wrong device, not a
      // quiet user -- worth saying so rather than leaving the bar at zero.
      silenceTimer = setTimeout(() => setState(prev => (prev === 'listening' ? 'silent' : prev)), 4000);
    } catch (err) {
      console.error('Mic check failed:', err);
      teardown();
      setState('denied');
    }
  }, []);

  useEffect(() => () => { teardownRef.current?.(); }, []);

  return { state, level, start, stop, setState };
}

export const VoiceSandbox: React.FC<VoiceSandboxProps> = ({ open, onClose }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stage, setStage] = useState<'setup' | 'connecting' | 'connected' | 'ended'>('setup');
  const [agentSource, setAgentSource] = useState<'demo' | 'custom'>('demo');
  const [modules, setModules] = useState<VoiceModule[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('demo-agent-emi-reminder');
  const [customerName, setCustomerName] = useState<string>("Abhigyan");
  // What the call is about. Optional -- the public demo has no loan -- but with
  // it the agent names the actual amount instead of saying something vague, and
  // these are the fields a real borrower list will carry.
  const [loanId, setLoanId] = useState<string>("");
  const [amountDue, setAmountDue] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [loadingModules, setLoadingModules] = useState<boolean>(false);
  const [submittingCall, setSubmittingCall] = useState<boolean>(false);
  const [selectedVoice, setSelectedVoice] = useState<string>(DEFAULT_VOICE_ID);
  // Language is the point of the product now, so it is a choice rather than the
  // constant it used to be. Provider is still fixed: Cartesia.
  const [selectedLanguage, setSelectedLanguage] = useState<string>(DEFAULT_LANGUAGE);
  const ttsProvider = TTS_PROVIDER;
  // No UI control sets this today; it is still sent to the server, where
  // 'quality' stops the TTS chunker splitting on commas.
  const [optimizeFor] = useState<'latency' | 'quality'>('latency');
  const [mobileStep, setMobileStep] = useState<1 | 2>(1);
  const [timeLeft, setTimeLeft] = useState<number>(SANDBOX_SECONDS);
  // Surfaced in the panel instead of alert(), which blocks the whole tab.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // A custom agent's saved language is a starting point, applied once when you
  // actually switch to that agent.
  //
  // This used to also set the language from the selected DEMO agent, with
  // `modules` in the dependency list -- so any background refetch returning a new
  // array identity silently reset a language you had just chosen, with no action
  // on your part. Scenarios are language-independent now, so selecting one no
  // longer touches the language at all, and the id is compared against a ref
  // rather than inferred from array identity.
  const appliedModuleRef = useRef<string | null>(null);
  useEffect(() => {
    if (appliedModuleRef.current === selectedModuleId) return;
    appliedModuleRef.current = selectedModuleId;

    if (agentSource !== 'custom') return;
    const activeMod = modules.find(m => (m._id || m.id) === selectedModuleId);
    if (activeMod?.selectedVoice) setSelectedVoice(activeMod.selectedVoice);
    if (activeMod?.selectedLanguage) setSelectedLanguage(activeMod.selectedLanguage);
  }, [selectedModuleId, modules, agentSource]);

  // A voice belongs to exactly one language, so changing language has to move
  // the voice with it -- a Hindi voice reading Tamil produces confident nonsense.
  useEffect(() => {
    const available = CARTESIA_VOICES[selectedLanguage] || [];
    if (!available.some(v => v.id === selectedVoice)) {
      setSelectedVoice(defaultVoiceFor(selectedLanguage));
    }
  }, [selectedLanguage, selectedVoice]);

  const [finalizedTranscripts, setFinalizedTranscripts] = useState<TranscriptLine[]>([]);
  const [activePartials, setActivePartials] = useState<Record<string, TranscriptLine>>({});
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState<boolean>(false);
  // Server-measured mouth-to-ear per turn. Arrives on the media socket just after
  // the audio, while the reply text arrives on the transcript socket, so the two
  // are matched by turn id rather than by arrival order.
  const [turnLatencies, setTurnLatencies] = useState<Record<number, TurnLatency>>({});
  // Live mic level during a session. The orb only ever reacted to the agent, so
  // a user talking into a dead mic had no way to tell.
  const [isUserSpeaking, setIsUserSpeaking] = useState<boolean>(false);
  const micCheck = useMicCheck();
  // Who the agent says it is. Depends on the language ("प्रिया" in Hindi,
  // "ஜனனி" in Tamil), so it is read off the call the server just created rather
  // than duplicated in a table here that would drift.
  const [agentName, setAgentName] = useState<string>('Agent');
  // Ticked off as the session goes, so "things to try" is a checklist rather
  // than a wall of suggestions the user has to keep in their head.
  const [doneScenarios, setDoneScenarios] = useState<Set<string>>(new Set());
  const [showPromptPanel, setShowPromptPanel] = useState<boolean>(false);
  const [draftInstruction, setDraftInstruction] = useState<string>('');
  const [promptStatus, setPromptStatus] = useState<'idle' | 'queued' | 'applied'>('idle');

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
  const speakingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setSelectedModuleId('demo-agent-emi-reminder');
      setStage('setup');
      setMobileStep(1);
      setTimeLeft(SANDBOX_SECONDS);
      setErrorMessage(null);
      setFinalizedTranscripts([]);
      setActivePartials({});
      setTurnLatencies({});
      setAgentName('Agent');
      setDoneScenarios(new Set());
      setShowPromptPanel(false);
      setDraftInstruction('');
      setPromptStatus('idle');
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
    if (stage === 'connected' && timeLeft === 0) handleEndSandboxCall();
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
    // `.catch`: this is the same context beginCapture published, so the pending
    // warm-up below may reach for it too.
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }

    // A capture still in flight would otherwise leave the mic open forever:
    // the permission prompt can resolve long after the user gave up.
    if (micWarmupRef.current) {
      const pending = micWarmupRef.current;
      micWarmupRef.current = null;
      pending.stream
        .then(stream => stream.getTracks().forEach(t => t.stop()))
        .catch(() => {});
      if (pending.context.state !== 'closed') pending.context.close().catch(() => {});
    }

    if (speakingTimerRef.current) { clearTimeout(speakingTimerRef.current); speakingTimerRef.current = null; }
    setIsUserSpeaking(false);

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

  /** Tick off any scenario this utterance counts as an attempt at. */
  const markScenarioIfMatched = (spoken: string) => {
    const matched = matchedScenarios(spoken);
    if (matched.length === 0) return;
    setDoneScenarios(prev => {
      const next = new Set(prev);
      for (const id of matched) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  };

  /** Push a new persona to the live session; it applies from the next turn. */
  const applyInstruction = () => {
    const ws = streamWsRef.current;
    const instruction = draftInstruction.trim();
    if (!instruction || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ event: 'update_prompt', instruction }));
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

    // Published now rather than in attachAudioStreaming, which only runs once
    // getUserMedia resolves. The agent greets as soon as the session is ready --
    // usually while the permission prompt is still up -- and playAudioChunk bails
    // when this is null, so the whole greeting was being dropped on the floor.
    audioContextRef.current = context;

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
        if (audioContextRef.current === context) audioContextRef.current = null;
        context.close().catch(() => {});
        return;
      }

      mediaStreamRef.current = stream;
      if (context.state === 'suspended') await context.resume();

      const sourceNode = context.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      const worklet = new AudioWorkletNode(context, 'audio-processor');
      workletNodeRef.current = worklet;
      processorNodeRef.current = worklet;

      worklet.port.onmessage = (e: MessageEvent) => {
        const data = e.data;
        if (!data || data.type !== 'audio') return;

        // Off the frames we are already sending, so this costs no extra
        // analysis. Held briefly so the indicator does not flicker between the
        // words of a sentence.
        if (typeof data.rms === 'number' && !isMutedRef.current) {
          if (data.rms >= SPEECH_RMS) {
            setIsUserSpeaking(true);
            if (speakingTimerRef.current) clearTimeout(speakingTimerRef.current);
            speakingTimerRef.current = setTimeout(() => setIsUserSpeaking(false), 400);
          }
        }

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
    setTurnLatencies({});
    setDoneScenarios(new Set());
    setPromptStatus('idle');
    clientMetricsRef.current = {};
    // Two live captures of the same device is a needless way to fail on the
    // platforms that disallow it.
    micCheck.stop();
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
        body: JSON.stringify({
          moduleId: selectedModuleId,
          customerName: customerName.trim(),
          selectedVoice, selectedLanguage, ttsProvider, optimizeFor,
          loanId: loanId.trim() || undefined,
          amountDue: amountDue ? Number(amountDue) : undefined,
          dueDate: dueDate || undefined,
        })
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.message || detail.error || `Server returned ${response.status}`);
      }
      const resData = await response.json();
      const call = resData.call;
      // moduleName is "<persona> — <scenario>"; the transcript wants the persona.
      if (typeof call?.moduleName === 'string') {
        setAgentName(call.moduleName.split('—')[0].trim() || 'Agent');
      }

      // One source of truth for the WS host. The old inline version rewrote any
      // host carrying a port to `localhost:5001` -- so a preview build on :4173,
      // or any deployment on an explicit port, pointed at the developer's laptop.
      const wsBase = getWsBaseUrl();

      // Read straight off the context. Awaiting the mic promise here would put
      // the permission prompt back on the critical path -- and if getUserMedia
      // never settles, the socket would never open at all.
      const captureRate = capture.context.sampleRate;

      // The language travels on the socket URL too: some server-side errors fire
      // before the call record is read, and those messages still have to be in
      // the language the session is being held in.
      const streamParams = new URLSearchParams({
        sampleRate: String(captureRate),
        language: selectedLanguage,
      });
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
          } else if (msg.event === "prompt_updated") {
            // Queued means the agent was mid-reply; it takes effect on the next
            // turn rather than rewriting the rules under a sentence in flight.
            setPromptStatus(msg.queued ? 'queued' : 'applied');
            setTimeout(() => setPromptStatus('idle'), 2500);
          } else if (msg.event === "voice_error") {
            // The pipeline is alive but the voice is not. Say so: silence with
            // no explanation is the single worst failure mode this demo has,
            // because it is indistinguishable from the product not working.
            setErrorMessage(msg.message || "The voice service isn't responding.");
          } else if (msg.event === "turn_latency") {
            if (typeof msg.turnId === 'number' && typeof msg.ms === 'number') {
              setTurnLatencies(prev => ({ ...prev, [msg.turnId]: { ms: msg.ms, stages: msg.stages ?? null } }));
            }
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
          if (msg.type === "connection_established") {
            // This socket opens alongside the media socket, not before it, so the
            // agent's opener can be broadcast while nobody is registered to hear
            // it -- the server drops the message in that case. The backlog it
            // keeps is replayed here, which is the only reason the greeting
            // reliably reaches the transcript.
            const history = Array.isArray(msg.history) ? msg.history : [];
            if (history.length === 0) return;
            setFinalizedTranscripts(prev => {
              const seen = new Set(prev.map(l => `${l.source}|${l.text}`));
              const missing = history
                .map((h: any): TranscriptLine => ({
                  source: h.speaker === 'AI' ? 'ai' : 'user',
                  text: h.text,
                  isFinal: true,
                }))
                // A backlog entry can also have arrived as a live update, if the
                // broadcast landed between this socket registering and the
                // history being read.
                .filter((l: TranscriptLine) => l.text && !seen.has(`${l.source}|${l.text}`));
              return missing.length > 0 ? [...prev, ...missing] : prev;
            });
          } else if (msg.type === "transcript_update") {
            const { text, isFinal, source, turnId } = msg;
            if (isFinal && source === 'user') markScenarioIfMatched(text);
            if (isFinal) {
              setFinalizedTranscripts(prev => (
                // The greeting can arrive twice -- once live, once in the backlog
                // replayed above -- depending on which socket won the race.
                prev.some(l => l.source === source && l.text === text)
                  ? prev
                  : [...prev, { source, text, isFinal: true, turnId }]
              ));
              setActivePartials(prev => { const n = { ...prev }; delete n[source]; return n; });
            } else if (!text) {
              // An empty partial means "drop this one", which is how a barge-in
              // retracts the half-spoken sentence it just cut off. Storing it
              // would render an empty speech bubble that never goes away.
              setActivePartials(prev => {
                if (!(source in prev)) return prev;
                const n = { ...prev }; delete n[source]; return n;
              });
            } else {
              // Server-side partials are cumulative: STT resends the whole
              // utterance so far, and the AI stream is now coalesced into the
              // sentence so far rather than one token per message. Replacing is
              // therefore correct -- appending here would duplicate the text.
              setActivePartials(prev => ({ ...prev, [source]: { source, text, isFinal: false, turnId } }));
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
    //
    // A session that actually ran lands on the summary rather than snapping back
    // to the config form. The 'ended' stage was in the type from the start and
    // was never once set, so the end of a demo -- the moment someone decides
    // whether to sign up -- was spent on an abrupt cut back to a form.
    setStage(prev => (prev === 'connected' ? 'ended' : 'setup'));
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

  /** Back to the config form, keeping the agent and voice already chosen. */
  const handleRestart = () => {
    setFinalizedTranscripts([]);
    setActivePartials({});
    setTurnLatencies({});
    setDoneScenarios(new Set());
    setPromptStatus('idle');
    setTimeLeft(SANDBOX_SECONDS);
    setErrorMessage(null);
    setStage('setup');
  };

  // What the session actually delivered, for the summary screen. Median rather
  // than mean so one cold first turn does not define the number.
  const sessionStats = (() => {
    const samples = Object.values(turnLatencies).map(l => l.ms).sort((a, b) => a - b);
    const agentTurns = finalizedTranscripts.filter(l => l.source === 'ai').length;
    const yourTurns = finalizedTranscripts.filter(l => l.source === 'user').length;
    return {
      p50: samples.length > 0 ? samples[Math.floor(samples.length / 2)] : null,
      fastest: samples.length > 0 ? samples[0] : null,
      agentTurns,
      yourTurns,
    };
  })();

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!open) return null;

  const voices = CARTESIA_VOICES[selectedLanguage] || [];

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
                        if (src === 'demo') setSelectedModuleId('demo-agent-emi-reminder');
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
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${active ? 'bg-blue-50 text-blue-600' : 'bg-zinc-100 text-zinc-500'}`}>
                                  {agent.role}
                                </span>
                              </div>
                              <p className="text-[11px] font-medium mt-0.5 text-zinc-500">
                                {agent.description}
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
                      placeholder="Abhigyan"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-900 text-[13px] font-medium placeholder:text-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
                    />
                  </div>

                  {/* What the call is about. Without it the agent can only speak
                      in generalities where a real collections call names the
                      figure -- and these are exactly the columns a borrower list
                      will have, so nothing here is throwaway. */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Loan</label>
                      <input
                        type="text"
                        value={loanId}
                        onChange={e => setLoanId(e.target.value)}
                        placeholder="LN-44718"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-900 text-[13px] font-medium placeholder:text-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Amount due</label>
                      <input
                        type="number"
                        value={amountDue}
                        onChange={e => setAmountDue(e.target.value)}
                        placeholder="4820"
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-900 text-[13px] font-medium placeholder:text-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Was due</label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={e => setDueDate(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-zinc-900 text-[13px] font-medium focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
                      />
                    </div>
                  </div>

                  {/* Language first: it decides which voices are even offered,
                      and for a collections agent it is the whole point. */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Language</label>
                    <div className="flex flex-wrap gap-1.5">
                      {LANGUAGES.map(l => (
                        <button
                          key={l.code}
                          onClick={() => setSelectedLanguage(l.code)}
                          className={`px-2.5 py-1.5 rounded-lg text-[13px] font-medium border transition-all ${
                            selectedLanguage === l.code
                              ? 'bg-white border-blue-200 text-blue-700 shadow-sm'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:border-zinc-300'
                          } ${usesDevanagari(l.code) ? 'font-deva' : ''}`}
                        >
                          {l.native}
                        </button>
                      ))}
                    </div>
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

                  {/* Mic check. A muted or wrong input device is the most common
                      way a session fails, and the symptom -- the agent never
                      answers -- looks exactly like the product being broken. */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">Microphone</label>
                    {micCheck.state === 'idle' ? (
                      <button
                        onClick={micCheck.start}
                        className="w-full h-9 bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 hover:border-zinc-300 rounded-lg text-[11px] font-bold text-zinc-700 uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                      >
                        <Mic className="w-3.5 h-3.5" />
                        Test my mic
                      </button>
                    ) : (
                      <div className={`rounded-lg border px-3 py-2.5 transition-colors ${
                        micCheck.state === 'heard' ? 'border-emerald-200 bg-emerald-50'
                        : micCheck.state === 'denied' || micCheck.state === 'silent' ? 'border-amber-200 bg-amber-50'
                        : 'border-zinc-200 bg-zinc-50'
                      }`}>
                        <div className="flex items-center gap-2.5">
                          {micCheck.state === 'heard'
                            ? <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" strokeWidth={3} />
                            : micCheck.state === 'denied' || micCheck.state === 'silent'
                              ? <MicOff className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                              : <Mic className="w-3.5 h-3.5 shrink-0 text-zinc-500" />}
                          <div className="flex-1 min-w-0">
                            <p className={`text-[11px] font-semibold leading-tight ${
                              micCheck.state === 'heard' ? 'text-emerald-800'
                              : micCheck.state === 'denied' || micCheck.state === 'silent' ? 'text-amber-800'
                              : 'text-zinc-700'
                            }`}>
                              {micCheck.state === 'requesting' ? 'Waiting for permission...'
                                : micCheck.state === 'listening' ? 'Say something'
                                : micCheck.state === 'heard' ? 'We can hear you'
                                : micCheck.state === 'silent' ? "We're not hearing anything"
                                : 'Microphone blocked'}
                            </p>
                            {(micCheck.state === 'silent' || micCheck.state === 'denied') && (
                              <p className="text-[10px] text-amber-700 mt-0.5 leading-tight">
                                {micCheck.state === 'denied'
                                  ? 'Allow mic access in your browser, then try again.'
                                  : 'Check that the right input device is selected and unmuted.'}
                              </p>
                            )}
                          </div>
                          {(micCheck.state === 'silent' || micCheck.state === 'denied') && (
                            <button
                              onClick={micCheck.start}
                              className="shrink-0 text-[10px] font-bold text-amber-800 uppercase tracking-widest hover:underline"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                        {/* Level meter. Full scale is a little above normal
                            speech, so a normal voice fills most of the bar. */}
                        {(micCheck.state === 'listening' || micCheck.state === 'heard') && (
                          <div className="mt-2 h-1 w-full rounded-full bg-zinc-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-[width] duration-75 ${micCheck.state === 'heard' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(100, (micCheck.level / 0.15) * 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
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

        {/* ── ENDED ── */}
        {stage === 'ended' && (
          <div className="flex flex-col md:flex-row flex-1 h-full bg-white overflow-y-auto md:overflow-hidden">
            {/* Left: what the session actually delivered */}
            <div className="w-full md:w-[40%] border-b md:border-b-0 md:border-r border-zinc-200 bg-[#F9FAFB] flex flex-col justify-between p-6 md:p-8 shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-300" />
                  <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Session ended</span>
                </div>

                <h3 className="text-[15px] font-bold text-zinc-900 tracking-tight mb-1">
                  {sessionStats.p50 !== null ? `${sessionStats.p50}ms median reply` : 'That was the sandbox'}
                </h3>
                <p className="text-[11px] text-zinc-500 leading-relaxed mb-6">
                  {sessionStats.p50 !== null
                    ? 'Measured from the moment you stopped speaking to the first audio of the reply.'
                    : 'Guest sessions run for 60 seconds.'}
                </p>

                <div className="space-y-2.5">
                  {[
                    ['Your turns', String(sessionStats.yourTurns)],
                    ['Agent replies', String(sessionStats.agentTurns)],
                    ['Fastest reply', sessionStats.fastest !== null ? `${sessionStats.fastest}ms` : '—'],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-baseline justify-between border-b border-zinc-200/70 pb-2">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{label}</span>
                      <span className="text-[13px] font-bold text-zinc-900 font-mono">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 mt-8">
                {!user && (
                  <button
                    // Same target as the other agent CTAs in this modal; there
                    // is no /signup route, and inventing one here would 404.
                    onClick={() => { onClose(); navigate('/modules'); }}
                    className="w-full h-10 bg-[#0044FF] hover:bg-blue-700 text-white text-[11px] font-bold uppercase tracking-widest rounded-lg shadow-[0_4px_14px_0_rgba(0,118,255,0.39)] transition-all active:scale-[0.98]"
                  >
                    Build your own agent
                  </button>
                )}
                <button
                  onClick={handleRestart}
                  className="w-full h-10 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-900 shadow-sm text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all active:scale-[0.98]"
                >
                  Run another session
                </button>
              </div>
            </div>

            {/* Right: the transcript, kept rather than thrown away */}
            <div className="flex-1 flex flex-col bg-white min-h-[300px] md:min-h-0 shrink-0">
              <div className="px-6 py-4 border-b border-zinc-200">
                <h4 className="text-[13px] font-bold text-zinc-900 tracking-tight">Transcript</h4>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-5">
                {finalizedTranscripts.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-[11px] text-zinc-400">Nothing was said this session.</p>
                  </div>
                ) : finalizedTranscripts.map((line, idx) => {
                  const latency = line.source === 'ai' && line.turnId !== undefined
                    ? turnLatencies[line.turnId]
                    : undefined;
                  return (
                    <div key={`${line.source}-${line.turnId ?? 'x'}-${idx}`} className={`flex flex-col w-full max-w-[90%] ${line.source === 'ai' ? 'self-start items-start' : 'self-end items-end ml-auto'}`}>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1 px-1">
                        {line.source === 'ai' ? agentName : customerName}
                      </span>
                      <div className={`px-4 py-2.5 rounded-xl text-[13px] font-medium leading-relaxed shadow-sm ${
                        line.source === 'ai'
                          ? 'bg-zinc-100 border border-zinc-200 text-zinc-900 rounded-tl-sm'
                          : 'bg-[#0044FF] text-white rounded-tr-sm'
                      }`}>
                        {line.text}
                      </div>
                      {latency && (
                        <span className="mt-1 px-1 text-[9px] font-bold tracking-widest text-zinc-400 font-mono">
                          {latency.ms}MS
                        </span>
                      )}
                    </div>
                  );
                })}
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
                <div className={`px-2.5 py-1 rounded-md border shadow-sm flex items-center gap-1.5 transition-colors ${timeLeft <= 10 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-zinc-200 text-zinc-600'}`}>
                  {/* Said in words, not just a colour: the pill going red tells
                      you something changed, not that the session is about to
                      end or that ending it is normal. */}
                  {timeLeft <= 10 && (
                    <span className="text-[9px] font-bold uppercase tracking-widest">Wrapping up</span>
                  )}
                  <span className="text-[10px] font-bold tracking-widest font-mono">
                    {formatTime(timeLeft)}
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div className="w-full mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 z-10">
                  <AlertCircle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <p className="text-[10px] font-medium leading-relaxed text-amber-800">{errorMessage}</p>
                </div>
              )}

              <div className="flex flex-col items-center justify-center flex-1 w-full z-10 py-8">
                <div className="relative w-24 h-24 flex items-center justify-center mb-6">
                  {(isAgentSpeaking || (isUserSpeaking && !isMuted)) && (
                    <div
                      className={`absolute inset-0 rounded-full animate-pulse ${isAgentSpeaking ? 'bg-blue-500/10' : 'bg-emerald-500/10'}`}
                      style={{ animationDuration: isAgentSpeaking ? '2s' : '1s' }}
                    />
                  )}
                  {/* Ring scaled by live mic level, so the user can see they are
                      being heard. Previously the orb reacted only to the agent,
                      which left a dead microphone looking identical to a working
                      one right up until the agent failed to answer. */}
                  <div className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-sm ${
                    isAgentSpeaking
                      ? 'bg-blue-50 border border-blue-200'
                      : isUserSpeaking && !isMuted
                        ? 'bg-emerald-50 border border-emerald-200 scale-105'
                        : 'bg-white border border-zinc-200'
                  }`}>
                    <Mic className={`w-5 h-5 transition-colors duration-300 ${
                      isMuted ? 'text-zinc-400'
                        : isAgentSpeaking ? 'text-blue-600'
                        : isUserSpeaking ? 'text-emerald-600'
                        : 'text-zinc-600'
                    }`} />
                  </div>
                </div>
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                  {isAgentSpeaking ? 'Agent Speaking'
                    : isMuted ? 'Mic Muted'
                    : isUserSpeaking ? 'Hearing you'
                    : 'Listening...'}
                </span>
                <p className="text-[13px] font-bold text-zinc-900 mt-3">{agentName}</p>
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
              <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between gap-3">
                <h4 className="text-[13px] font-bold text-zinc-900 tracking-tight">Live Transcript</h4>
                <div className="flex items-center gap-2">
                  {/* Progress through the suggested tests, so the checklist is
                      still visible once the transcript has scrolled it away. */}
                  {doneScenarios.size > 0 && (
                    <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
                      {doneScenarios.size}/{SCENARIOS.length} tried
                    </span>
                  )}
                  <button
                    onClick={() => setShowPromptPanel(v => !v)}
                    className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest border transition-all ${
                      showPromptPanel
                        ? 'bg-zinc-900 border-zinc-900 text-white'
                        : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                    }`}
                  >
                    Edit prompt
                  </button>
                </div>
              </div>

              {/* Live persona editing. Applies from the next turn, so the loop is
                  tweak, hear it, tweak -- instead of ending the session, leaving
                  the modal, editing the agent and re-granting the microphone. */}
              {showPromptPanel && (
                <div className="px-6 py-4 border-b border-zinc-200 bg-[#F9FAFB] space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block">
                    Agent instructions
                  </label>
                  <textarea
                    value={draftInstruction}
                    onChange={e => setDraftInstruction(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="You are a blunt, impatient procurement officer. Keep replies under 10 words."
                    className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-zinc-900 text-[12px] font-medium placeholder:text-zinc-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={applyInstruction}
                      disabled={!draftInstruction.trim()}
                      className="px-3 h-8 bg-[#0044FF] hover:bg-blue-700 disabled:opacity-40 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all"
                    >
                      Apply
                    </button>
                    <span className={`text-[10px] font-semibold transition-opacity ${promptStatus === 'idle' ? 'opacity-0' : 'opacity-100'} ${promptStatus === 'queued' ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {promptStatus === 'queued' ? 'Applies after this reply' : 'Live from the next turn'}
                    </span>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-5">
                {finalizedTranscripts.length === 0 && Object.keys(activePartials).length === 0 ? (
                  <div className="h-full flex flex-col justify-center">
                    {/* The test script, handed over rather than hoped for. A
                        blank page leaves visitors to invent a test, and most
                        invent "hello, how are you" -- which proves nothing a
                        text chatbot could not also do. */}
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Things worth trying</p>
                    <p className="text-[11px] text-zinc-500 mb-4">Each one tests something different. Just say it out loud.</p>
                    <div className="space-y-2">
                      {SCENARIOS.map(scenario => {
                        const done = doneScenarios.has(scenario.id);
                        return (
                          <div
                            key={scenario.id}
                            className={`rounded-xl border px-3.5 py-2.5 transition-all ${
                              done ? 'border-emerald-200 bg-emerald-50/60' : 'border-zinc-200 bg-white'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className={`mt-[3px] w-3.5 h-3.5 shrink-0 rounded-full border flex items-center justify-center ${
                                done ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300'
                              }`}>
                                {done && <Check className="w-2 h-2 text-white" strokeWidth={4} />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <span className={`text-[12px] font-bold tracking-tight ${done ? 'text-emerald-900' : 'text-zinc-900'}`}>
                                    {scenario.label}
                                  </span>
                                  <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-400">
                                    {scenario.proves}
                                  </span>
                                </div>
                                <p className={`text-[12px] font-medium italic mt-1 leading-snug ${done ? 'text-emerald-800' : 'text-zinc-700'}`}>
                                  &ldquo;{scenario.say}&rdquo;
                                </p>
                                <p className="text-[10px] text-zinc-500 mt-1 leading-snug">{scenario.hint}</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  [...finalizedTranscripts, ...Object.values(activePartials)].map((line, idx) => {
                    const latency = line.source === 'ai' && line.turnId !== undefined
                      ? turnLatencies[line.turnId]
                      : undefined;
                    return (
                      // Keyed on the turn, not the index: the array is finalized
                      // lines plus live partials, so an index shifts the moment a
                      // partial is promoted and every row below it remounts.
                      <div
                        key={`${line.source}-${line.turnId ?? 'x'}-${line.isFinal ? 'f' : 'p'}-${idx}`}
                        className={`flex flex-col w-full max-w-[90%] ${line.source === 'ai' ? 'self-start items-start' : 'self-end items-end ml-auto'}`}
                      >
                        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-1 px-1">
                          {line.source === 'ai' ? agentName : customerName}
                        </span>
                        <div className={`px-4 py-2.5 rounded-xl text-[13px] font-medium leading-relaxed shadow-sm ${
                          line.source === 'ai'
                            ? 'bg-zinc-100 border border-zinc-200 text-zinc-900 rounded-tl-sm'
                            : 'bg-[#0044FF] text-white rounded-tr-sm'
                        } ${!line.isFinal ? 'opacity-60 italic' : ''}`}>
                          {line.text}
                        </div>
                        {latency && (
                          <span
                            title={latency.stages
                              ? `Thinking ${latency.stages.think}ms · Speaking ${latency.stages.speak}ms\nMeasured server-side, from the moment you stopped speaking to the first audio of the reply.`
                              : 'Measured server-side, from the moment you stopped speaking to the first audio of the reply.'}
                            className="mt-1 px-1 text-[9px] font-bold tracking-widest text-zinc-400 font-mono cursor-default hover:text-zinc-600 transition-colors"
                          >
                            {latency.ms}MS
                          </span>
                        )}
                      </div>
                    );
                  })
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
