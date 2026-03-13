import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Phone, User, Bot, Wifi, WifiOff, XCircle, Activity, MessageSquare } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { api, getWsBaseUrl, getStoredToken } from '../lib/api';

interface TranscriptLine {
  id: string;
  speaker: 'AI' | 'User';
  text: string;
  timestamp: Date;
  type: 'question' | 'response' | 'analysis' | 'system' | 'intervention';
}

interface LiveCallModalProps {
  callId: string;
  customerName: string;
  phoneNumber: string;
  onClose: () => void;
}


const LiveCallModal: React.FC<LiveCallModalProps> = ({
  callId,
  customerName,
  phoneNumber,
  onClose
}) => {
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [streamingAIText, setStreamingAIText] = useState<string>('');
  const [streamingUserText, setStreamingUserText] = useState<string>('');
  const [callStatus, setCallStatus] = useState<'connecting' | 'active' | 'completed' | 'failed'>('connecting');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [currentQuestion, setCurrentQuestion] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasReceivedData, setHasReceivedData] = useState(false);
  const [interventionText, setInterventionText] = useState('');
  const [isSendingIntervention, setIsSendingIntervention] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const callStartTime = useRef<Date>(new Date());

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [transcript, streamingAIText, streamingUserText, scrollToBottom]);

  // Add messages uniquely and maintain sort order
  const addMessages = useCallback((newLines: TranscriptLine[]) => {
    if (newLines.length === 0) return;
    
    setTranscript(prev => {
      const combined = [...prev];
      let changed = false;

      newLines.forEach(newLine => {
        // Robust pure deduplication: check if the ID or similar content already exists in prev
        const isDuplicate = prev.some(existing => 
          existing.id === newLine.id ||
          (existing.text.trim().toLowerCase() === newLine.text.trim().toLowerCase() && 
           existing.speaker === newLine.speaker &&
           Math.abs(existing.timestamp.getTime() - newLine.timestamp.getTime()) < 2000)
        );

        if (!isDuplicate) {
          combined.push(newLine);
          changed = true;
        }
      });

      if (!changed) return prev;
      
      // Sort by timestamp. If timestamps are identical, User comes before AI.
      return combined.sort((a, b) => {
        const timeDiff = a.timestamp.getTime() - b.timestamp.getTime();
        if (timeDiff !== 0) return timeDiff;
        if (a.speaker === 'User' && b.speaker === 'AI') return -1;
        if (a.speaker === 'AI' && b.speaker === 'User') return 1;
        return 0;
      });
    });
  }, []);

  // Fetch call details and setup WebSocket connection
  useEffect(() => {
    const fetchCallDetails = async () => {
      setLoading(true);
      setError('');

      try {
        const token = getStoredToken();
        if (!token) {
          setError('Authentication required');
          return;
        }

        const data = await api.getCallDetails(token, callId);

        if (data.success && data.call) {
          const currentStatus = data.call.status;
          
          if (data.call.createdAt) {
            callStartTime.current = new Date(data.call.createdAt);
          }

          // Handle completed/failed calls immediately
          if (currentStatus === 'completed' || currentStatus === 'failed' || currentStatus === 'busy' || currentStatus === 'no-answer' || currentStatus === 'canceled') {
            setCallStatus(currentStatus === 'completed' ? 'completed' : 'failed');
            setHasReceivedData(true);

            if (data.call.transcription) {
              const parsedTranscript = parseStoredTranscript(data.call.transcription);
              addMessages(parsedTranscript);
              setCurrentQuestion('Call completed');
            } else if (currentStatus === 'completed') {
              setError('Transcript not available for this call');
            } else {
              setError(`Call ${currentStatus.replace('-', ' ')} - No transcript available`);
            }
          } else {
            // Active call path
            setCallStatus('connecting');
            setCurrentQuestion('Connecting to live session...');
            setupWebSocketConnection();
          }
        } else {
          setError('Failed to load call details');
        }
      } catch (err) {
        console.error('[LiveCallModal] Error fetching details:', err);
        setError('Failed to load call transcript');
      } finally {
        setLoading(false);
      }
    };

    const setupWebSocketConnection = () => {
      try {
        if (wsRef.current) wsRef.current.close();
        
        const wsUrl = `${getWsBaseUrl()}/live-call?callId=${callId}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnectionStatus('connected');
          setCallStatus('active');
          setCurrentQuestion('Stable connection established');
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
              case 'connection_established':
                if (message.history && message.history.length > 0) {
                  setHasReceivedData(true);
                  const historyLines = message.history.map((line: any, idx: number) => ({
                    id: `hist-${idx}-${Date.now()}`,
                    speaker: line.speaker,
                    text: line.text,
                    timestamp: new Date(line.timestamp),
                    type: line.type || 'system'
                  }));
                  addMessages(historyLines);
                }
                break;

              case 'transcript_update':
                const source = message.source?.toLowerCase() || message.speaker?.toLowerCase();
                setHasReceivedData(true);
                if (!message.isFinal) {
                  if (source === 'ai') setStreamingAIText(message.text);
                  else setStreamingUserText(message.text);
                  return;
                }

                // Final message processing
                if (source === 'ai') setStreamingAIText('');
                else setStreamingUserText('');

                addMessages([{
                  id: `live-${Date.now()}`,
                  speaker: source === 'ai' ? 'AI' : 'User',
                  text: message.text,
                  timestamp: new Date(message.timestamp || Date.now()),
                  type: message.type || (source === 'ai' ? 'question' : 'response')
                }]);

                if (message.question) setCurrentQuestion(message.question);
                break;

              case 'call_status':
                setCallStatus(message.status);
                if (message.status === 'completed') setCurrentQuestion('Call completed');
                break;

              case 'call_completed':
                setCallStatus('completed');
                setConnectionStatus('disconnected');
                break;
            }
          } catch (e) {
            console.error('[LiveCallModal] WS Parse Error:', e);
          }
        };

        ws.onclose = () => setConnectionStatus('disconnected');
        ws.onerror = () => setConnectionStatus('disconnected');

      } catch (error) {
        console.error('[LiveCallModal] WS Setup Error:', error);
      }
    };

    fetchCallDetails();

    return () => {
      if (wsRef.current) {
        console.log('[LiveCallModal] Closing WebSocket connection');
        wsRef.current.close();
      }
    };
  }, [callId, addMessages]);

  const sendIntervention = useCallback(() => {
    if (!interventionText.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setIsSendingIntervention(true);
    wsRef.current.send(JSON.stringify({
      type: 'manual_intervention',
      text: interventionText.trim()
    }));

    // Optimistically clear or wait for ack? Let's clear for better UX
    setInterventionText('');
    setIsSendingIntervention(false);
  }, [interventionText]);

  const parseStoredTranscript = (transcription: string): TranscriptLine[] => {
    const lines = transcription.split('\n').filter(line => line.trim());
    return lines.map((line, index) => {
      // Handle various AI prefixes (AI:, VokAI:, Vok.AI:, Voicely:)
      const isAI = /^(AI:|VokAI:|Vok\.AI:|Voicely:)/i.test(line);
      // Strip any speaker prefix and analysis tags
      const text = line.replace(/^(AI:|User:|VokAI:|Vok\.AI:|Voicely:)/i, '').split('[Analysis:')[0].trim();
      
      return {
        id: `stored-${index}`,
        speaker: isAI ? 'AI' : 'User',
        text,
        // Ensure each message has a unique sequential timestamp for the sort logic
        timestamp: new Date(callStartTime.current.getTime() + index * 10), 
        type: isAI ? 'question' : 'response'
      };
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-300">
      <div className="bg-zinc-950/90 rounded-3xl border border-white/10 shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-white/5">
        
        {/* Sleek Header */}
        <div className="flex items-center justify-between p-6 bg-gradient-to-b from-white/5 to-transparent border-b border-white/5">
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="bg-indigo-500/10 p-4 rounded-2xl ring-1 ring-indigo-500/20">
                <Phone className="w-7 h-7 text-indigo-400" />
              </div>
              {callStatus === 'active' && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-white tracking-tight">Transcript</h2>
                <Badge className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-widest uppercase border-0 ${
                  callStatus === 'active' ? 'bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]' : 
                  callStatus === 'completed' ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30' : 
                  'bg-zinc-800 text-zinc-400'
                }`}>
                  {callStatus}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1.5">
                <span className="text-zinc-400 font-medium">{customerName}</span>
                <span className="w-1 h-1 rounded-full bg-zinc-700"></span>
                <span className="text-zinc-500 font-mono text-sm">{phoneNumber}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className={`p-2 rounded-xl transition-colors ${connectionStatus === 'connected' ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              {connectionStatus === 'connected' ? 
                <Wifi className="w-5 h-5 text-emerald-400" /> : 
                <WifiOff className="w-5 h-5 text-red-400" />
              }
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-2xl hover:bg-white/5 text-zinc-500 hover:text-white transition-all"
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
        </div>

        <div className="px-8 py-3 bg-white/[0.02] border-b border-white/5 flex items-center justify-between text-xs font-medium uppercase tracking-widest text-zinc-500">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 opacity-50" />
              <span className="text-zinc-400 max-w-[300px] truncate">{currentQuestion || 'System Idle'}</span>
            </div>
          </div>
          <div className="font-mono text-[10px] opacity-40">Session: #{callId.slice(-8)}</div>
        </div>

        {/* Premium Conversation Flow */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-indigo-400/50" />
                </div>
              </div>
              <p className="text-zinc-500 font-medium animate-pulse">Initializing Secure Channel...</p>
            </div>
          ) : error && transcript.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
              <div className="p-6 bg-red-500/10 rounded-full">
                <XCircle className="w-12 h-12 text-red-500/50" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">Analysis Offline</h3>
                <p className="text-zinc-500 max-w-xs mx-auto leading-relaxed">{error}</p>
              </div>
            </div>
          ) : (!hasReceivedData && transcript.length === 0 && streamingUserText === '' && streamingAIText === '') ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-8 animate-in fade-in zoom-in duration-1000">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-indigo-500/5 flex items-center justify-center ring-1 ring-white/5">
                  <Bot className="w-10 h-10 text-indigo-400/30" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                   <div className="w-16 h-16 rounded-full border border-indigo-500/20 border-t-indigo-500 animate-[spin_3s_linear_infinite]"></div>
                </div>
              </div>
              <div className="space-y-3">
                <h3 className="text-xl font-bold text-white tracking-tight">Signal established</h3>
                <p className="text-zinc-500 max-w-[200px] mx-auto text-sm leading-relaxed">Waiting for the first spoken word to begin analysis...</p>
              </div>
            </div>
          ) : (transcript.length === 0 && streamingUserText === '' && streamingAIText === '') ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
              <div className="p-6 bg-red-500/10 rounded-full">
                <Bot className="w-12 h-12 text-indigo-500/30" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">No Messages Yet</h3>
                <p className="text-zinc-500 max-w-xs mx-auto leading-relaxed">
                  {callStatus === 'completed' 
                    ? "This call session doesn't have a transcript recorded." 
                    : "The conversation has started, but no words have been captured yet."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {transcript.map((line) => (
                <div key={line.id} className={`flex ${line.speaker === 'AI' ? 'justify-start' : 'justify-end'} group animate-in slide-in-from-bottom-2 duration-500`}>
                  <div className={`max-w-[75%] flex flex-col ${line.speaker === 'AI' ? 'items-start' : 'items-end'}`}>
                    <div className="flex items-center gap-2.5 mb-2 px-1">
                      {line.speaker === 'AI' ? (
                        <div className={`h-6 w-6 rounded-lg ${line.type === 'intervention' ? 'bg-emerald-500/20 ring-emerald-500/30' : 'bg-indigo-500/20 ring-indigo-500/30'} flex items-center justify-center ring-1`}>
                          <Bot className={`w-3.5 h-3.5 ${line.type === 'intervention' ? 'text-emerald-400' : 'text-indigo-400'}`} />
                        </div>
                      ) : (
                        <div className="h-6 w-6 rounded-lg bg-white/5 flex items-center justify-center ring-1 ring-white/10 order-2">
                          <User className="w-3.5 h-3.5 text-zinc-400" />
                        </div>
                      )}
                      <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${line.speaker === 'AI' ? (line.type === 'intervention' ? 'text-emerald-400' : 'text-indigo-400') : 'text-zinc-400'}`}>
                        {line.speaker === 'AI' ? (line.type === 'intervention' ? 'ADMIN' : 'Voicely') : customerName}
                      </span>
                    </div>

                    <div className={`px-5 py-4 rounded-3xl shadow-2xl transition-all duration-300 ring-1 ${
                      line.speaker === 'AI' 
                      ? (line.type === 'intervention' 
                        ? 'bg-zinc-900 text-zinc-100 rounded-tl-none border-0 ring-emerald-500/30 border-l-2 border-l-emerald-500' 
                        : 'bg-zinc-900 text-zinc-100 rounded-tl-none border-0 ring-white/5')
                      : 'bg-indigo-600 text-white rounded-tr-none ring-black/10 border-indigo-500/50'
                    }`}>
                      <p className="text-[15px] leading-[1.6] font-medium antialiased">{line.text}</p>
                    </div>
                    
                    <span className="mt-2 text-[9px] font-medium text-zinc-600 tracking-tighter uppercase px-1">
                      {line.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}

              {/* Dynamic Streaming State */}
              {(streamingUserText || streamingAIText) && (
                <div className={`flex ${streamingAIText ? 'justify-start' : 'justify-end'} group animate-in slide-in-from-bottom-2 duration-300`}>
                   <div className={`max-w-[75%] flex flex-col ${streamingAIText ? 'items-start' : 'items-end'}`}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                       <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${streamingAIText ? 'text-indigo-400' : 'text-zinc-500'}`}>
                        {streamingAIText ? 'Voicely is typing...' : `${customerName} is speaking...`}
                      </span>
                    </div>

                    <div className={`px-5 py-4 rounded-3xl ring-1 shadow-xl transition-all duration-300 ${
                      streamingAIText 
                      ? 'bg-zinc-800/40 text-zinc-300 rounded-tl-none ring-white/5 border-0' 
                      : 'bg-indigo-600/40 text-indigo-50 rounded-tr-none ring-indigo-500/20 border-0'
                    }`}>
                      <p className="text-[15px] leading-[1.6] italic font-normal antialiased">
                        {streamingAIText || streamingUserText}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <div ref={transcriptEndRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Global Footer & Intervention Input */}
        <div className="p-6 bg-black/40 border-t border-white/5 backdrop-blur-xl space-y-4">
           {callStatus === 'active' && (
             <div className="flex items-center gap-4 animate-in slide-in-from-bottom-4 duration-500">
               <div className="flex-1 relative group">
                 <div className="absolute inset-0 bg-indigo-500/5 rounded-2xl blur-lg group-focus-within:bg-indigo-500/10 transition-all opacity-0 group-focus-within:opacity-100" />
                 <input 
                   type="text"
                   value={interventionText}
                   onChange={(e) => setInterventionText(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && sendIntervention()}
                   placeholder="Type to intervene and speak as the AI..."
                   className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 transition-all relative z-10 font-medium"
                 />
               </div>
               <Button 
                 onClick={sendIntervention}
                 disabled={!interventionText.trim() || isSendingIntervention}
                 className="h-14 px-8 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center gap-3"
               >
                 <MessageSquare className="w-5 h-5" />
                 INTERVENE
               </Button>
             </div>
           )}
           <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-600">
              <div className="flex items-center gap-3">
                 <div className="h-1.5 w-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"></div>
                 Secure Session Active
              </div>
              <div className="flex items-center gap-2">
                 <Activity className="w-3 h-3 opacity-50" />
                 End-to-End Real-time Analysis
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default LiveCallModal;
