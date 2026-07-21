import { getSystemTwilioClient, getTwilioClientForUser } from '../config/twilio.js';
import ProviderCredential from '../models/ProviderCredential.js';
import Call from '../models/Call.js';
import Module from '../models/Module.js';
import { analyzeResponseWithGemini } from '../config/gemini.js';
import { generateHybridTTS } from './hybridTTS.js';
import { getVoiceForLanguage } from '../config/translations.js';
import { broadcastTranscriptUpdate } from '../websocket/liveCallServer.js';
import logger from '../utils/logger.js';

// Removed insecure TLS bypass. Use proper root CA in dev if needed.

export const initiateCall = async (params) => {
    const { moduleId, phoneNumber, customerName, selectedVoice, selectedLanguage, ttsProvider, userId, priorContext } = params;
    const publicUrl = process.env.NGROK_URL || process.env.BASE_URL;

    if (!publicUrl) throw new Error('Public URL (BASE_URL/NGROK_URL) is required');

    const webhookUrl = new URL(`${publicUrl}/api/calls/handle-call`);
    webhookUrl.searchParams.set('moduleId', moduleId);
    webhookUrl.searchParams.set('customerName', customerName);
    webhookUrl.searchParams.set('phoneNumber', phoneNumber);
    webhookUrl.searchParams.set('step', '0');
    webhookUrl.searchParams.set('selectedVoice', selectedVoice);
    webhookUrl.searchParams.set('selectedLanguage', selectedLanguage);
    if (ttsProvider) webhookUrl.searchParams.set('ttsProvider', ttsProvider);

    logger.info(`Generated Twilio Webhook URL: ${webhookUrl.toString()}`);

    let client;
    let fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (userId) {
        try {
            client = await getTwilioClientForUser(userId);
            const provider = await ProviderCredential.findOne({ userId, providerName: 'twilio', isDefault: true });
            if (provider && provider.credentials.phoneNumber) {
                fromNumber = provider.credentials.phoneNumber;
            }
        } catch (error) {
            logger.warn(`Failed to get custom Twilio client for user ${userId}, falling back to system client: ${error.message}`);
            client = getSystemTwilioClient();
        }
    } else {
        client = getSystemTwilioClient();
    }

    const call = await client.calls.create({
        method: 'POST',
        url: webhookUrl.toString(),
        to: phoneNumber,
        from: fromNumber,
        statusCallback: `${publicUrl}/api/calls/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
    });
    return call;
};

export const initiateDeveloperCall = async (params) => {
    const { phoneNumber, prompt, developerKey } = params;
    const publicUrl = process.env.NGROK_URL || process.env.BASE_URL;

    if (!publicUrl) throw new Error('Public URL (BASE_URL/NGROK_URL) is required');

    // Create a specific developer webhook URL.
    // It passes the developerKeyId so mediaStream knows to use dynamic prompt and config.
    const webhookUrl = new URL(`${publicUrl}/api/calls/handle-developer-call`);
    webhookUrl.searchParams.set('phoneNumber', phoneNumber);
    webhookUrl.searchParams.set('developerKeyId', developerKey._id.toString());
    
    // We must URL encode the prompt because it can be long
    webhookUrl.searchParams.set('prompt', encodeURIComponent(prompt));

    logger.info(`Generated Developer Twilio Webhook URL: ${webhookUrl.toString()}`);

    let client;
    let fromNumber = process.env.TWILIO_PHONE_NUMBER;

    try {
        client = await getTwilioClientForUser(developerKey.userId);
        const provider = await ProviderCredential.findOne({ userId: developerKey.userId, providerName: 'twilio', isDefault: true });
        if (provider && provider.credentials.phoneNumber) {
            fromNumber = provider.credentials.phoneNumber;
        }
    } catch (error) {
        logger.warn(`Failed to get custom Twilio client for developer ${developerKey.userId}, falling back to system client: ${error.message}`);
        client = getSystemTwilioClient();
    }

    const call = await client.calls.create({
        method: 'POST',
        url: webhookUrl.toString(),
        to: phoneNumber,
        from: fromNumber,
        statusCallback: `${publicUrl}/api/calls/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
    });
    return call;
};

export const hangupCall = async (callSid, userId = null) => {
    try {
        let client;
        if (userId) {
            try {
                client = await getTwilioClientForUser(userId);
            } catch(e) {
                client = getSystemTwilioClient();
            }
        } else {
            // Try to look up the call to get the userId if not provided
            const callRecord = await Call.findOne({ twilioCallSid: callSid });
            if (callRecord && callRecord.userId) {
                try {
                    client = await getTwilioClientForUser(callRecord.userId);
                } catch(e) {
                    client = getSystemTwilioClient();
                }
            } else {
                client = getSystemTwilioClient();
            }
        }
        const call = await client.calls(callSid).fetch();
        
        if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(call.status)) {
            logger.debug(`Call ${callSid} is already in terminal state: ${call.status}. Skipping hangup.`);
            return call;
        }

        const updatedCall = await client.calls(callSid).update({ status: 'completed' });
        logger.info(`Call ${callSid} terminated programmatically. [Final Status: ${updatedCall.status}]`);
        return updatedCall;
    } catch (error) {
        // If the call is already completed, Twilio might return a 400 error.
        // We catch it here to prevent polluting logs if it's not a critical failure.
        if (error.code === 21211) {
            logger.debug(`Call ${callSid} was already finished when hangup attempted.`);
            return { sid: callSid, status: 'completed' };
        }
        logger.error(`Error hanging up call ${callSid}:`, error);
        throw error;
    }
};

export const generateSmartAudio = async (text, voice, language, twiml) => {
    const voiceId = getVoiceForLanguage(voice, language);
    const result = await generateHybridTTS(text, voiceId);

    if (result.success && !result.useTwiML) {
        const publicUrl = process.env.NGROK_URL || process.env.BASE_URL || 'http://localhost:5001';
        twiml.play(`${publicUrl}${result.audioUrl}`);
    } else {
        twiml.say(text, {
            voice: result.voice || 'Polly.Aditi',
            language: result.language || 'en-IN'
        });
    }
};

export const analyzeResponse = async (response, question) => {
    const prompt = `
    Analyze this customer response:
    Question: "${question}"
    Response: "${response}"
    Return only YES, NO, or MAYBE.
  `;
    return await analyzeResponseWithGemini(prompt);
};
