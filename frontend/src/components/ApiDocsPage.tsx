import React, { useEffect } from 'react';
import { ArrowLeft, Server, Zap, Shield, Code2, Headphones } from 'lucide-react';
import { Link } from 'react-router-dom';

const nodeExample = `const WebSocket = require('ws');

// 1. Your generated developer key
const TOKEN = 'vk_dev_123456789...';
const PROMPT = encodeURIComponent('You are a helpful customer support agent.');

// 2. Connect to the Voicely Developer Pipeline
const ws = new WebSocket(\`wss://app.voicely.com/api/v1/stream?token=\${TOKEN}&prompt=\${PROMPT}\`);

ws.on('open', () => {
  console.log('Connected to Voicely Speech-to-Speech Engine!');
  
  // 3. Send 16kHz Linear PCM binary audio over the socket
  // Example: Streaming chunks from a microphone or Twilio
  // setInterval(() => {
  //   const audioChunk = get16kHzPcmAudio(); 
  //   ws.send(audioChunk, { binary: true });
  // }, 100);
});

ws.on('message', (data) => {
  // 4. Receive real-time 8kHz Mu-law binary audio back from the AI
  if (data instanceof Buffer) {
    console.log('Received AI audio chunk:', data.length, 'bytes');
    // Play this chunk via speaker or send back to a phone call
  } else {
    // Occasional JSON messages for errors or metadata
    console.log('Message:', data.toString());
  }
});

ws.on('close', () => console.log('Pipeline closed'));
ws.on('error', (err) => console.error('Pipeline error:', err));
`;

const pythonExample = `import websocket
import urllib.parse
import pyaudio

TOKEN = "vk_dev_123456789..."
PROMPT = urllib.parse.quote("You are a helpful customer support agent.")
WS_URL = f"wss://app.voicely.com/api/v1/stream?token={TOKEN}&prompt={PROMPT}"

def on_message(ws, message):
    if isinstance(message, bytes):
        print(f"Received {len(message)} bytes of AI audio")
        # Play the audio chunks using pyaudio or send to phone line
    else:
        print("Received text:", message)

def on_error(ws, error):
    print("Error:", error)

def on_close(ws, close_status_code, close_msg):
    print("Pipeline connection closed")

def on_open(ws):
    print("Connected to Voicely S2S!")
    # Start a thread to record and send 16kHz PCM audio
    # ws.send(pcm_audio_chunk, opcode=websocket.ABNF.OPCODE_BINARY)

if __name__ == "__main__":
    ws = websocket.WebSocketApp(WS_URL,
                              on_open=on_open,
                              on_message=on_message,
                              on_error=on_error,
                              on_close=on_close)
    ws.run_forever()
`;

const ApiDocsPage: React.FC = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-black font-sans text-zinc-300 pt-24 pb-32">
      <div className="max-w-4xl mx-auto px-6">
        {/* Navigation / Header */}
        <div className="mb-12">
          <Link to="/developer" className="inline-flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-sm font-medium mb-6">
            <ArrowLeft className="w-4 h-4" />
            Back to Developer Dashboard
          </Link>
          <h1 className="text-4xl font-bold text-white tracking-tight">API Usage Guide</h1>
          <p className="text-lg text-zinc-400 mt-4 max-w-2xl leading-relaxed">
            Connect to our ultra-low latency Speech-to-Speech (S2S) engine using a single WebSocket. 
            Stream raw audio in, and get AI-generated audio out.
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          <div className="border border-white/[0.05] bg-white/[0.02] p-6 rounded-2xl transition-colors hover:bg-white/[0.04]">
            <Zap className="w-5 h-5 text-white mb-4" />
            <h3 className="text-white font-medium mb-2 text-sm">Real-time Streaming</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">Bidirectional streaming ensures latencies as low as 300ms from human speech to AI response.</p>
          </div>
          <div className="border border-white/[0.05] bg-white/[0.02] p-6 rounded-2xl transition-colors hover:bg-white/[0.04]">
            <Shield className="w-5 h-5 text-white mb-4" />
            <h3 className="text-white font-medium mb-2 text-sm">Bring Your Own Key</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">Your API keys are encrypted. We act as a high-speed router between providers.</p>
          </div>
          <div className="border border-white/[0.05] bg-white/[0.02] p-6 rounded-2xl transition-colors hover:bg-white/[0.04]">
            <Server className="w-5 h-5 text-white mb-4" />
            <h3 className="text-white font-medium mb-2 text-sm">Agnostic Pipeline</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">Swap between OpenAI, Gemini, Llama, Deepgram, and Cartesia without changing your code.</p>
          </div>
        </div>

        {/* Section 1: Connection */}
        <section className="mb-20">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
              <span className="text-white text-xs font-medium">1</span>
            </div>
            <h2 className="text-xl font-medium text-white tracking-tight">Connecting to the Pipeline</h2>
          </div>
          
          <div className="border border-white/[0.08] rounded-2xl overflow-hidden mb-6 bg-transparent">
            <div className="border-b border-white/[0.05] p-5 flex items-center gap-4 bg-white/[0.02]">
              <span className="px-2.5 py-1 rounded-md bg-white/10 text-white text-[10px] uppercase font-bold tracking-widest">WebSocket URL</span>
              <code className="text-sm text-zinc-300 font-mono">wss://app.voicely.com/api/v1/stream</code>
            </div>
            
            <div className="p-8">
              <p className="text-sm text-zinc-500 mb-8">
                To authenticate and configure your pipeline session, you must pass query parameters in the connection URL.
              </p>
              
              <h4 className="text-[10px] uppercase font-semibold tracking-widest text-zinc-500 mb-4">Query Parameters</h4>
              <div className="border border-white/[0.05] rounded-xl overflow-hidden bg-transparent">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/[0.02] text-xs text-zinc-400 border-b border-white/[0.05]">
                    <tr>
                      <th className="px-5 py-3.5 font-medium">Parameter</th>
                      <th className="px-5 py-3.5 font-medium">Required</th>
                      <th className="px-5 py-3.5 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    <tr>
                      <td className="px-5 py-4 font-mono text-xs text-zinc-300">token</td>
                      <td className="px-5 py-4"><span className="px-2 py-1 rounded bg-white/10 text-white text-[10px] font-medium">Yes</span></td>
                      <td className="px-5 py-4 text-zinc-500 text-xs leading-relaxed">Your generated Secret Key (<code className="text-zinc-300">vk_dev_...</code>). This tells the server which providers to use and decrypts your API credentials.</td>
                    </tr>
                    <tr>
                      <td className="px-5 py-4 font-mono text-xs text-zinc-300">prompt</td>
                      <td className="px-5 py-4"><span className="px-2 py-1 rounded bg-white/10 text-white text-[10px] font-medium">Yes</span></td>
                      <td className="px-5 py-4 text-zinc-500 text-xs leading-relaxed">The system prompt for the AI agent. Must be URL-encoded. Defines the persona and behavior.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Audio Formats */}
        <section className="mb-20">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
              <span className="text-white text-xs font-medium">2</span>
            </div>
            <h2 className="text-xl font-medium text-white tracking-tight">Audio Formats</h2>
          </div>
          
          <p className="text-zinc-500 text-sm leading-relaxed mb-8">
            The Voicely pipeline uses raw binary audio chunks over WebSockets to minimize overhead and latency. 
            There are no JSON wrappers around the audio data.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-white/[0.05] bg-transparent p-8 rounded-2xl">
              <div className="flex items-center gap-3 mb-6">
                <Headphones className="w-4 h-4 text-zinc-400" />
                <h3 className="text-white font-medium text-sm">What You Send (Input)</h3>
              </div>
              <ul className="space-y-4 text-sm text-zinc-400">
                <li className="flex justify-between items-center pb-3 border-b border-white/[0.05]">
                  <span className="text-zinc-500">Encoding</span>
                  <span className="font-mono text-zinc-300">Linear PCM (16-bit)</span>
                </li>
                <li className="flex justify-between items-center pb-3 border-b border-white/[0.05]">
                  <span className="text-zinc-500">Sample Rate</span>
                  <span className="font-mono text-zinc-300">16,000 Hz</span>
                </li>
                <li className="flex justify-between items-center pb-3 border-b border-white/[0.05]">
                  <span className="text-zinc-500">Channels</span>
                  <span className="font-mono text-zinc-300">1 (Mono)</span>
                </li>
                <li className="text-xs pt-2 text-zinc-500 leading-relaxed">Send raw binary chunks (<code className="text-zinc-300">ws.send(buffer)</code>).</li>
              </ul>
            </div>

            <div className="border border-white/[0.05] bg-transparent p-8 rounded-2xl">
              <div className="flex items-center gap-3 mb-6">
                <Code2 className="w-4 h-4 text-zinc-400" />
                <h3 className="text-white font-medium text-sm">What You Receive (Output)</h3>
              </div>
              <ul className="space-y-4 text-sm text-zinc-400">
                <li className="flex justify-between items-center pb-3 border-b border-white/[0.05]">
                  <span className="text-zinc-500">Encoding</span>
                  <span className="font-mono text-zinc-300">Mu-law / PCM</span>
                </li>
                <li className="flex justify-between items-center pb-3 border-b border-white/[0.05]">
                  <span className="text-zinc-500">Sample Rate</span>
                  <span className="font-mono text-zinc-300">8,000 Hz</span>
                </li>
                <li className="flex justify-between items-center pb-3 border-b border-white/[0.05]">
                  <span className="text-zinc-500">Channels</span>
                  <span className="font-mono text-zinc-300">1 (Mono)</span>
                </li>
                <li className="text-xs pt-2 text-zinc-500 leading-relaxed">We stream raw binary directly back to you as soon as the TTS engine generates it.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 3: Implementation Examples */}
        <section>
          <div className="flex items-center gap-4 mb-8">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
              <span className="text-white text-xs font-medium">3</span>
            </div>
            <h2 className="text-xl font-medium text-white tracking-tight">Implementation Examples</h2>
          </div>

          <div className="space-y-10">
            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-4 tracking-wide">Node.js Example</h3>
              <div className="border border-white/[0.05] rounded-2xl overflow-hidden bg-black">
                <div className="bg-white/[0.02] border-b border-white/[0.05] px-4 py-2 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-white/20"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-white/20"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-white/20"></div>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono ml-2">index.js</span>
                </div>
                <pre className="p-6 overflow-x-auto text-xs text-zinc-400 font-mono custom-scrollbar leading-relaxed">
                  {nodeExample}
                </pre>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-medium text-zinc-300 mb-4 tracking-wide">Python Example</h3>
              <div className="border border-white/[0.05] rounded-2xl overflow-hidden bg-black">
                <div className="bg-white/[0.02] border-b border-white/[0.05] px-4 py-2 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-white/20"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-white/20"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-white/20"></div>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono ml-2">client.py</span>
                </div>
                <pre className="p-6 overflow-x-auto text-xs text-zinc-400 font-mono custom-scrollbar leading-relaxed">
                  {pythonExample}
                </pre>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default ApiDocsPage;
