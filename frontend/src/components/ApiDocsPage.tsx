import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Copy, ChevronRight, ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const CodeBlock = ({ code, language }: { code: string, language: string }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group rounded-xl overflow-hidden bg-[#111113] border border-white/[0.04] shadow-sm font-mono text-[13px] leading-relaxed">
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.02] border-b border-white/[0.04]">
        <span className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">{language}</span>
        <button 
          onClick={copyToClipboard}
          className="text-zinc-500 hover:text-white transition-colors p-1"
          title="Copy code"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <div className="p-4 overflow-x-auto custom-scrollbar">
        <pre className="text-zinc-300">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
};

const nodeExample = `const WebSocket = require('ws');

// 1. Setup your credentials and parameters
const TOKEN = 'vk_dev_123456789...';
const PROMPT = encodeURIComponent('You are a helpful assistant. Keep your answers brief and conversational.');

// 2. Connect to the Voicely Developer S2S Pipeline
const ws = new WebSocket(\`wss://app.voicely.com/api/v1/stream?token=\${TOKEN}&prompt=\${PROMPT}\`);

ws.on('open', () => {
  console.log('Connected to Voicely Speech-to-Speech Engine!');
  
  // 3. Send 16kHz linear16 PCM binary audio over the socket
  // Example: Streaming chunks from a microphone or Twilio
  // setInterval(() => {
  //   const audioChunk = get16kHzPcmAudio(); 
  //   ws.send(audioChunk, { binary: true });
  // }, 100);
});

ws.on('message', (data) => {
  // 4. Receive Real-time AI Audio Responses
  if (Buffer.isBuffer(data)) {
    console.log('Received AI audio payload:', data.length, 'bytes');
    // Play this chunk via speaker or stream back to phone
  } else {
    // The server sends JSON messages for events (e.g., connection success)
    try {
      const event = JSON.parse(data.toString());
      console.log('Server Event:', event);
    } catch (e) {
      console.log('Message:', data.toString());
    }
  }
});

ws.on('close', () => console.log('Pipeline connection closed'));
ws.on('error', (err) => console.error('Pipeline error:', err));
`;

const pythonExample = `import websocket
import urllib.parse
import json

TOKEN = "vk_dev_123456789..."
PROMPT = urllib.parse.quote("You are a helpful assistant. Keep your answers brief and conversational.")
WS_URL = f"wss://app.voicely.com/api/v1/stream?token={TOKEN}&prompt={PROMPT}"

def on_message(ws, message):
    if isinstance(message, bytes):
        print(f"Received {len(message)} bytes of AI audio payload")
        # Play the audio chunks using pyaudio or send to phone line
    else:
        try:
            event = json.loads(message)
            print("Server Event:", event)
        except json.JSONDecodeError:
            print("Received text:", message)

def on_error(ws, error):
    print("Error:", error)

def on_close(ws, close_status_code, close_msg):
    print("Pipeline connection closed")

def on_open(ws):
    print("Connected to Voicely S2S!")
    # Start a thread to record and send 16kHz linear16 PCM audio
    # ws.send(pcm_audio_chunk, opcode=websocket.ABNF.OPCODE_BINARY)

if __name__ == "__main__":
    ws = websocket.WebSocketApp(WS_URL,
                              on_open=on_open,
                              on_message=on_message,
                              on_error=on_error,
                              on_close=on_close)
    ws.run_forever()
`;

const steps = [
  { id: 1, title: 'Overview' },
  { id: 2, title: 'Connection & Auth' },
  { id: 3, title: 'Data Formats' },
  { id: 4, title: 'Implementation' },
];

const ApiDocsPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentStep]);

  const handleNext = () => {
    if (currentStep < steps.length) setCurrentStep(currentStep + 1);
  };

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  return (
    <div className="min-h-screen bg-[#111113] font-sans text-zinc-300">
      <div className="max-w-4xl mx-auto px-6 sm:px-12 pt-16 pb-32">
        {/* Navigation / Header */}
        <div className="mb-12">
          <Link to="/developer" className="inline-flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm font-medium mb-8">
            <ArrowLeft className="w-4 h-4" />
            Back to Developer Dashboard
          </Link>
          <h1 className="text-4xl font-bold text-white tracking-tight mb-4">API Usage Guide</h1>
          <p className="text-lg text-zinc-400 max-w-2xl leading-relaxed">
            Connect to our ultra-low latency Speech-to-Speech (S2S) engine using a single WebSocket. 
          </p>
        </div>

        {/* Wizard Progress Bar */}
        <div className="flex items-center justify-between mb-12 border-b border-white/[0.04] pb-4">
          <div className="flex items-center gap-2">
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <div 
                  className={`flex items-center gap-2 text-sm font-medium ${currentStep === step.id ? 'text-white' : currentStep > step.id ? 'text-zinc-500 cursor-pointer hover:text-zinc-300' : 'text-zinc-700'}`}
                  onClick={() => currentStep > step.id && setCurrentStep(step.id)}
                >
                  <span className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] ${currentStep === step.id ? 'bg-white/10 text-white' : currentStep > step.id ? 'bg-white/[0.04] text-zinc-400' : 'bg-transparent border border-white/[0.04] text-zinc-600'}`}>
                    {step.id}
                  </span>
                  <span className="hidden sm:inline-block">{step.title}</span>
                </div>
                {index < steps.length - 1 && (
                  <div className="w-6 sm:w-12 h-px bg-white/[0.04] mx-2" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="min-h-[400px]">
          {currentStep === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <h2 className="text-2xl font-semibold text-white tracking-tight mb-8">Architecture Overview</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#141416] border border-white/[0.04] p-6 rounded-xl shadow-sm">
                  <h3 className="text-white font-medium mb-3 text-[14px]">Real-time Streaming</h3>
                  <p className="text-[13px] text-zinc-500 leading-relaxed">Bidirectional streaming ensures latencies as low as 300ms from human speech to AI response.</p>
                </div>
                <div className="bg-[#141416] border border-white/[0.04] p-6 rounded-xl shadow-sm">
                  <h3 className="text-white font-medium mb-3 text-[14px]">Secure Routing</h3>
                  <p className="text-[13px] text-zinc-500 leading-relaxed">Your API keys are encrypted at rest. We act as a high-speed router securely dispatching to providers.</p>
                </div>
                <div className="bg-[#141416] border border-white/[0.04] p-6 rounded-xl shadow-sm">
                  <h3 className="text-white font-medium mb-3 text-[14px]">Agnostic Pipeline</h3>
                  <p className="text-[13px] text-zinc-500 leading-relaxed">Swap between OpenAI, Gemini, Llama, Deepgram, and Cartesia on the fly without changing your code.</p>
                </div>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <h2 className="text-2xl font-semibold text-white tracking-tight mb-8">Connection & Authentication</h2>
              
              <div className="bg-[#18181B] border border-white/[0.04] rounded-2xl overflow-hidden shadow-sm">
                <div className="border-b border-white/[0.04] p-6 flex flex-col md:flex-row md:items-center gap-4">
                  <span className="px-3 py-1.5 rounded-lg bg-white/[0.04] text-white text-[11px] uppercase font-bold tracking-wider border border-white/[0.05]">WebSocket Endpoint</span>
                  <code className="text-[13px] text-blue-400 font-mono">wss://app.voicely.com/api/v1/stream</code>
                </div>
                
                <div className="p-6 sm:p-8">
                  <p className="text-[14px] text-zinc-400 mb-8 leading-relaxed">
                    To authenticate and configure your pipeline session, you must pass query parameters in the connection URL or through standard HTTP headers during the WebSocket handshake.
                  </p>
                  
                  <h4 className="text-[11px] uppercase font-semibold tracking-wider text-zinc-500 mb-4">Connection Parameters</h4>
                  <div className="border border-white/[0.04] rounded-xl overflow-hidden bg-transparent">
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-[#141416] text-zinc-400 border-b border-white/[0.04]">
                        <tr>
                          <th className="px-6 py-4 font-medium">Parameter</th>
                          <th className="px-6 py-4 font-medium">Required</th>
                          <th className="px-6 py-4 font-medium">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.04]">
                        <tr>
                          <td className="px-6 py-4 font-mono text-blue-300 align-top">token</td>
                          <td className="px-6 py-4 align-top"><span className="px-2.5 py-1 rounded-md bg-white/10 text-white text-[10px] font-semibold uppercase tracking-wider">Yes</span></td>
                          <td className="px-6 py-4 text-zinc-400 leading-relaxed">
                            Your generated Secret Key (<code className="text-zinc-300 bg-white/[0.04] px-1.5 py-0.5 rounded">vk_dev_...</code>). This tells the server which providers to use and securely decrypts your API credentials. Can also be passed via <code className="text-zinc-300 bg-white/[0.04] px-1.5 py-0.5 rounded">Authorization: Bearer</code> header.
                          </td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 font-mono text-blue-300 align-top">prompt</td>
                          <td className="px-6 py-4 align-top"><span className="px-2.5 py-1 rounded-md bg-transparent border border-white/10 text-zinc-500 text-[10px] font-semibold uppercase tracking-wider">No</span></td>
                          <td className="px-6 py-4 text-zinc-400 leading-relaxed">
                            A URL-encoded string representing the System Prompt for the LLM. Defaults to a standard conversational assistant prompt if omitted.
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <h2 className="text-2xl font-semibold text-white tracking-tight mb-8">Audio Data Formats</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#141416] border border-white/[0.04] p-6 sm:p-8 rounded-xl shadow-sm flex flex-col h-full">
                  <h3 className="text-white font-medium mb-4 text-[15px]">Ingress (User Speech)</h3>
                  <p className="text-[13px] text-zinc-400 leading-relaxed mb-8 flex-1">
                    Stream binary audio directly into the WebSocket. The server expects raw uncompressed PCM audio chunks.
                  </p>
                  <ul className="space-y-3 mt-auto">
                    <li className="flex items-center justify-between text-[13px] border-b border-white/[0.04] pb-3">
                      <span className="text-zinc-500">Encoding</span>
                      <span className="text-white font-mono bg-white/[0.04] px-2 py-0.5 rounded">linear16</span>
                    </li>
                    <li className="flex items-center justify-between text-[13px] border-b border-white/[0.04] pb-3">
                      <span className="text-zinc-500">Sample Rate</span>
                      <span className="text-white font-mono bg-white/[0.04] px-2 py-0.5 rounded">16000 Hz</span>
                    </li>
                    <li className="flex items-center justify-between text-[13px] pb-1">
                      <span className="text-zinc-500">Channels</span>
                      <span className="text-white font-mono bg-white/[0.04] px-2 py-0.5 rounded">1 (Mono)</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-[#141416] border border-white/[0.04] p-6 sm:p-8 rounded-xl shadow-sm flex flex-col h-full">
                  <h3 className="text-white font-medium mb-4 text-[15px]">Egress (AI Speech)</h3>
                  <p className="text-[13px] text-zinc-400 leading-relaxed mb-8 flex-1">
                    The server will stream back AI-generated TTS audio as binary payloads over the same socket.
                  </p>
                  <ul className="space-y-3 mt-auto">
                    <li className="flex items-center justify-between text-[13px] border-b border-white/[0.04] pb-3">
                      <span className="text-zinc-500">Event Type</span>
                      <span className="text-white font-mono bg-white/[0.04] px-2 py-0.5 rounded">Binary Buffer</span>
                    </li>
                    <li className="flex items-center justify-between text-[13px] border-b border-white/[0.04] pb-3">
                      <span className="text-zinc-500">Encoding</span>
                      <span className="text-white font-mono bg-white/[0.04] px-2 py-0.5 rounded">Model Dependent</span>
                    </li>
                    <li className="flex items-center justify-between text-[13px] pb-1">
                      <span className="text-zinc-500">Initial JSON Event</span>
                      <span className="text-white font-mono bg-white/[0.04] px-2 py-0.5 rounded">{"{ type: 'connected' }"}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
              <h2 className="text-2xl font-semibold text-white tracking-tight mb-8">Implementation Examples</h2>
              
              <div className="space-y-8">
                <CodeBlock code={nodeExample} language="Node.js" />
                <CodeBlock code={pythonExample} language="Python" />
              </div>
            </div>
          )}
        </div>

        {/* Wizard Controls */}
        <div className="flex items-center justify-between mt-12 pt-8 border-t border-white/[0.04]">
          <button
            onClick={handlePrev}
            disabled={currentStep === 1}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/[0.04] text-zinc-400 hover:text-white"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
          
          <button
            onClick={handleNext}
            disabled={currentStep === steps.length}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-white text-black hover:bg-zinc-200"
          >
            {currentStep === steps.length ? 'Finish' : 'Next Step'}
            {currentStep !== steps.length && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ApiDocsPage;
