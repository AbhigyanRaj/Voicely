import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import DeveloperKey from '../models/DeveloperKey.js';
import DeepgramService from '../services/deepgramService.js';
import StreamingCartesiaTTS from '../services/streamingCartesiaTTS.js';
import { StreamingSarvamTTS } from '../services/sarvamService.js';
import { decrypt } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import fetch from 'node-fetch';

// Simple LLM Wrapper for BYOK
const generateDeveloperLLMStream = async (systemPrompt, chatHistory, userText, llmModel, apiKey, onChunk) => {
    let endpoint = '';
    let headers = {};
    let body = {};
    
    // Parse chat history simply
    const messages = [{ role: 'system', content: systemPrompt }];
    if (chatHistory) {
        let lastRole = 'system';
        chatHistory.split('\n').forEach(line => {
            const text = line.trim();
            if (!text) return;
            if (text.startsWith('User: ')) {
                // Prevent duplicate user messages to please Groq
                if (lastRole === 'user') {
                    messages[messages.length - 1].content += '\n' + text.substring(6);
                } else {
                    messages.push({ role: 'user', content: text.substring(6) });
                    lastRole = 'user';
                }
            } else if (text.startsWith('AI: ')) {
                if (lastRole === 'assistant') {
                    messages[messages.length - 1].content += '\n' + text.substring(4);
                } else {
                    messages.push({ role: 'assistant', content: text.substring(4) });
                    lastRole = 'assistant';
                }
            }
        });
    }
    
    // Always end with the latest user utterance
    if (messages[messages.length - 1].role === 'user') {
        messages[messages.length - 1].content += '\n' + userText;
    } else {
        messages.push({ role: 'user', content: userText });
    }

    try {
        if (llmModel.includes('gpt-') || llmModel.includes('gpt4')) {
            endpoint = 'https://api.openai.com/v1/chat/completions';
            headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
            body = { model: llmModel === 'gpt-4o' ? 'gpt-4o' : 'gpt-4o-mini', messages, stream: true, max_tokens: 150 };
        } else if (llmModel.includes('gemini')) {
            endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${llmModel}:streamGenerateContent?key=${apiKey}`;
            headers = { 'Content-Type': 'application/json' };
            body = { contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{text: m.content}] })) };
        } else {
            // Groq/Llama fallback
            endpoint = 'https://api.groq.com/openai/v1/chat/completions';
            headers = { 'Authorization': `Bearer ${apiKey || process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' };
            body = { model: 'llama-3.1-8b-instant', messages, stream: true, max_tokens: 150 };
        }

        const response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`LLM API Error ${response.status}: ${errorText}`);
        }
        
        return new Promise((resolve, reject) => {
            let fullText = '';
            response.body.on('data', (chunk) => {
                const textChunk = chunk.toString();
                // Basic naive parsing for OpenAI/Groq SSE format
                if (endpoint.includes('openai') || endpoint.includes('groq')) {
                    const lines = textChunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                            try {
                                const data = JSON.parse(line.slice(6));
                                const content = data.choices?.[0]?.delta?.content;
                                if (content) { fullText += content; onChunk(content); }
                            } catch (e) {}
                        }
                    }
                } else if (endpoint.includes('gemini')) {
                    // Gemini parsing is more complex, just grabbing roughly for demo
                    try {
                        const match = textChunk.match(/"text":\s*"([^"]+)"/);
                        if (match && match[1]) {
                            const content = match[1].replace(/\\n/g, '\n');
                            fullText += content;
                            onChunk(content);
                        }
                    } catch(e) {}
                }
            });
            response.body.on('end', () => resolve(fullText));
            response.body.on('error', reject);
        });
    } catch (err) {
        logger.error('Developer LLM Stream Error:', err);
        throw err;
    }
};

export const setupDeveloperStreamWebSocket = () => {
    const wss = new WebSocketServer({ noServer: true });

    wss.on('connection', async (ws, request) => {
        logger.info(`New Developer S2S WebSocket connection request from ${request.socket.remoteAddress}`);
        
        let deepgramService = null;
        let tts = null;

        try {
            const url = new URL(request.url, `http://${request.headers.host}`);
            const token = url.searchParams.get('token') || request.headers['authorization']?.split(' ')[1];
            const systemPrompt = url.searchParams.get('prompt') || 'You are a helpful assistant. Keep your answers brief and conversational.';

            if (!token || !token.startsWith('vk_dev_')) {
                ws.close(1008, 'Unauthorized: Invalid token');
                return;
            }

            const keyHash = crypto.createHash('sha256').update(token).digest('hex');
            const developerKey = await DeveloperKey.findOne({ keyHash });

            if (!developerKey) {
                ws.close(1008, 'Unauthorized: Key not found');
                return;
            }

            developerKey.lastUsedAt = Date.now();
            if (!developerKey.metrics) developerKey.metrics = { totalConnections: 0, avgLatencyMs: 0 };
            developerKey.metrics.totalConnections += 1;
            await developerKey.save();

            ws.send(JSON.stringify({ type: 'connected', message: 'Developer S2S Stream Established' }));
            logger.info(`Developer S2S Stream Established for Key ID: ${developerKey._id}`);

            // Decrypt keys
            const getDecryptedKey = (providerName) => {
                if (!developerKey.providerCredentials) return null;
                const encrypted = developerKey.providerCredentials.get(providerName);
                if (!encrypted) return null;
                try { return decrypt(encrypted); } catch (e) { return null; }
            };

            const sttKey = getDecryptedKey('Deepgram') || process.env.DEEPGRAM_API_KEY;
            let llmKey = getDecryptedKey('OpenAI') || getDecryptedKey('Google') || getDecryptedKey('Anthropic') || process.env.GROQ_API_KEY;
            const ttsKey = getDecryptedKey('Cartesia') || getDecryptedKey('ElevenLabs') || getDecryptedKey('Sarvam') || process.env.CARTESIA_API_KEY;

            // 1. STT Initialization
            deepgramService = new DeepgramService(sttKey);
            await deepgramService.createLiveConnection({
                language: 'en-US',
                smart_format: true,
                interim_results: false,
                endpointing: 300,
                encoding: 'linear16',
                sample_rate: 16000,
                channels: 1,
            });

            // 2. TTS Initialization
            if (developerKey.pipelineConfig.ttsModel === 'sarvam-aura') {
                tts = new StreamingSarvamTTS('en-IN', 'anushka', false, 'latency'); // Sarvam doesn't use API key via param right now
            } else {
                tts = new StreamingCartesiaTTS('47c38ca4-5f35-497b-b1a3-415245fb35e1', false, 'latency', ttsKey);
            }

            tts.on('audio', (audioData) => {
                if (ws.readyState === ws.OPEN) {
                    let payload = audioData.payload ? Buffer.from(audioData.payload, 'base64') : audioData;
                    ws.send(payload, { binary: true });
                }
            });

            // 3. Conversation Flow
            let chatHistory = "";
            let isGenerating = false;

            deepgramService.on('finalTranscript', async (data) => {
                if (isGenerating) return; // naive barge-in protection for demo
                const userText = data.text;
                logger.info(`[Dev API STT]: ${userText}`);
                
                isGenerating = true;
                try {
                    const llmModel = developerKey.pipelineConfig.llmModel;
                    
                    const aiResponseText = await generateDeveloperLLMStream(
                        systemPrompt, 
                        chatHistory, 
                        userText, 
                        llmModel, 
                        llmKey, 
                        (chunk) => {
                            tts.processTextChunk(chunk);
                        }
                    );
                    tts.flush();
                    
                    chatHistory += `User: ${userText}\nAI: ${aiResponseText}\n`;
                } catch (e) {
                    logger.error('Pipeline error:', e);
                } finally {
                    isGenerating = false;
                }
            });

            // 4. Ingest Audio
            ws.on('message', (message) => {
                if (Buffer.isBuffer(message)) {
                    deepgramService.sendAudio(message);
                }
            });

            ws.on('close', () => {
                logger.info(`Developer S2S Stream Closed for Key ID: ${developerKey._id}`);
                if (deepgramService) deepgramService.close();
                if (tts) tts.clear();
            });

            ws.on('error', (err) => {
                logger.error('Developer S2S WebSocket Error:', err);
                if (deepgramService) deepgramService.close();
            });

        } catch (error) {
            logger.error('Developer S2S Connection Error:', error);
            ws.close(1011, 'Internal Server Error');
        }
    });

    return wss;
};
