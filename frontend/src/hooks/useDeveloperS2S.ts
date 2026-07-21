import { useState, useRef, useCallback, useEffect } from 'react';
import { downsampleAndEncodeMulaw, float32ToPCM16, muLawToLinear } from '../lib/audioUtils';
import { getApiBaseUrl } from '../lib/api';

export const useDeveloperS2S = () => {
  const [isTesting, setIsTesting] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsTesting(false);
    nextStartTimeRef.current = 0;
  }, []);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const playAudioBinary = (buffer: ArrayBuffer) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;

    // Backend sends 8kHz mulaw binary
    const bytes = new Uint8Array(buffer);
    const float32Data = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      float32Data[i] = muLawToLinear(bytes[i]);
    }

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const audioBuffer = audioContext.createBuffer(1, float32Data.length, 8000);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    const currentTime = audioContext.currentTime;
    if (nextStartTimeRef.current < currentTime) {
      nextStartTimeRef.current = currentTime + 0.05;
    }

    source.start(nextStartTimeRef.current);
    nextStartTimeRef.current += audioBuffer.duration;
  };

  const startTesting = async (token: string) => {
    if (isTesting) return;
    try {
      // 1. Get Microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      // 2. Connect WebSocket
      const wsUrl = getApiBaseUrl().replace('http', 'ws').replace('/api/v1', '') + `/api/v1/stream?token=${token}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = () => {
        setIsTesting(true);
        // Start processing audio
        sourceNodeRef.current = audioContext.createMediaStreamSource(stream);
        processorNodeRef.current = audioContext.createScriptProcessor(4096, 1, 1);
        
        const inputSampleRate = audioContext.sampleRate;
        const outputSampleRate = 16000; // Deepgram in our backend expects 16kHz

        processorNodeRef.current.onaudioprocess = (e) => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);
          // Backend expects linear16 PCM 16kHz
          const pcm16 = float32ToPCM16(inputData, inputSampleRate, outputSampleRate);
          wsRef.current.send(pcm16.buffer);
        };

        sourceNodeRef.current.connect(processorNodeRef.current);
        processorNodeRef.current.connect(audioContext.destination);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          playAudioBinary(event.data);
        } else if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'error') {
              console.error('S2S Error:', msg.message);
              alert('Pipeline Error: ' + msg.message);
              cleanup();
            }
          } catch (e) {}
        }
      };

      ws.onclose = () => cleanup();
      ws.onerror = (e) => {
        console.error('WebSocket Error', e);
        cleanup();
      };

    } catch (error) {
      console.error('Failed to start testing', error);
      alert('Failed to access microphone or connect to pipeline.');
      cleanup();
    }
  };

  const stopTesting = () => {
    cleanup();
  };

  return { isTesting, startTesting, stopTesting };
};
