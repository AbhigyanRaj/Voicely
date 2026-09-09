import { WebSocketServer } from 'ws';
import crypto from 'crypto';
import DeveloperKey from '../models/DeveloperKey.js';
import DeepgramService from '../services/deepgramService.js';
import StreamingCartesiaTTS from '../services/streamingCartesiaTTS.js';
import { decrypt } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import fetch from 'node-fetch';

/**
 * Which vendor a model id routes to. Kept beside the request builder below so
 * credential resolution and endpoint selection can never disagree -- that
 * disagreement is what sent secrets to the wrong vendor.
 */
const llmProviderFor = (llmModel = '') => {
    if (llmModel.includes('gpt-') || llmModel.includes('gpt4')) return 'openai';
    if (llmModel.includes('gemini')) return 'gemini';
    return 'groq';
};

/** Credential map keys, as stored by the dashboard. */
const LLM_CREDENTIAL_NAME = {
    openai: 'OpenAI',
    gemini: 'Google',
    groq: 'Groq',
};

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
        const provider = llmProviderFor(llmModel);
        if (provider === 'openai') {
            endpoint = 'https://api.openai.com/v1/chat/completions';
            headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
            body = { model: llmModel === 'gpt-4o' ? 'gpt-4o' : 'gpt-4o-mini', messages, stream: true, max_tokens: 150 };
        } else if (provider === 'gemini') {
            endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${llmModel}:streamGenerateContent?key=${apiKey}`;
            headers = { 'Content-Type': 'application/json' };
            body = { contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{text: m.content}] })) };
        } else {
            // Groq/Llama fallback
            endpoint = 'https://api.groq.com/openai/v1/chat/completions';
            headers = { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
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
        
        ws.isAlive = true;
        ws.on('pong', () => {
            ws.isAlive = true;
        });

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
            // providerCredentials is select:false on the schema, so the BYOK
            // resolution below has to ask for it explicitly -- otherwise every
            // session silently falls back to the platform's own provider keys.
            const developerKey = await DeveloperKey.findOne({ keyHash }).select('+providerCredentials');

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

            // Credential resolution, keyed by the provider each slot will actually
            // call.
            //
            // This was a positional `||` cascade -- llmKey took the first of
            // OpenAI/Google/Anthropic that happened to be present, ttsKey the
            // first of Cartesia/ElevenLabs/Sarvam -- which routed one vendor's
            // secret to another vendor's endpoint. On the *default* selection the
            // user's Sarvam key was sent to api.cartesia.ai; choosing Whisper for
            // STT put their OpenAI key into a generativelanguage.googleapis.com
            // query string; choosing Claude sent it to api.groq.com as a bearer
            // token. It also never looked up 'Groq', so a developer's own Groq key
            // was stored and silently ignored.
            const getDecryptedKey = (providerName) => {
                if (!developerKey.providerCredentials) return null;
                const encrypted = developerKey.providerCredentials.get(providerName);
                if (!encrypted) return null;
                try { return decrypt(encrypted); } catch (e) { return null; }
            };

            /**
             * Resolve one slot. Falls back to the platform's key only when it
             * belongs to the same provider -- a credential is never handed to a
             * vendor it was not issued for.
             */
            const resolveSlotKey = (credentialName, platformKey) =>
                getDecryptedKey(credentialName) || platformKey || null;

            const sttKey = resolveSlotKey('Deepgram', process.env.DEEPGRAM_API_KEY);
            const ttsKey = resolveSlotKey('Cartesia', process.env.CARTESIA_API_KEY);

            // The LLM slot is the only one with a choice, so its credential has to
            // follow whichever endpoint llmModel selects.
            const llmProvider = llmProviderFor(developerKey.pipelineConfig.llmModel);
            const llmKey = resolveSlotKey(
                LLM_CREDENTIAL_NAME[llmProvider],
                llmProvider === 'groq' ? process.env.GROQ_API_KEY : null
            );

            if (!llmKey) {
                ws.send(JSON.stringify({
                    type: 'error',
                    code: 'missing_credential',
                    message: `This key selects a ${llmProvider} model but has no ${llmProvider} credential. `
                        + `Add one, or use a Groq model to run on the platform's key.`
                }));
                ws.close(1008, 'Missing provider credential');
                return;
            }

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

            // 2. TTS Initialization. Cartesia is the only provider; the
            //    ttsModel field on the key is not yet honoured (see README).
            tts = new StreamingCartesiaTTS('79a125e8-cd45-4c13-8a67-188112f4dd22', false, 'latency', ttsKey);

            tts.on('audio', (audioData) => {
                if (ws.readyState === ws.OPEN) {
                    let payload = audioData.payload ? Buffer.from(audioData.payload, 'base64') : audioData;
                    ws.send(payload, { binary: true });
                }
            });

            // 3. Conversation Flow
            let chatHistory = "";
            let isGenerating = false;

            // Required, not optional: DeepgramService extends EventEmitter and
            // emits 'error' on any post-open failure (an invalid BYOK key, for
            // instance). With no listener, Node throws ERR_UNHANDLED_ERROR and
            // the whole process dies. The sandbox path registers this; this one
            // did not.
            deepgramService.on('error', (error) => {
                logger.error('Developer S2S Deepgram error', error);
                if (ws.readyState === ws.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'error',
                        code: 'stt_failed',
                        message: 'Speech recognition failed for this session.'
                    }));
                }
            });

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
            // `isBinary` rather than Buffer.isBuffer: ws delivers text frames as
            // Buffers too, so a type check would forward any JSON control
            // message straight into the audio stream.
            ws.on('message', (message, isBinary) => {
                if (isBinary && message.length > 0) {
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

    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                logger.debug('Terminating dead Developer WS client');
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);

    wss.on('close', () => {
        clearInterval(interval);
    });

    return wss;
};
