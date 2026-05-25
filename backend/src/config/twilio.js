import twilio from 'twilio';
import logger from '../utils/logger.js';

const { validateRequest } = twilio;

import ProviderCredential from '../models/ProviderCredential.js';
import { decrypt } from '../utils/crypto.js';

// Lazy initialization of the system default Twilio client (fallback)
let systemClient = null;

export const getSystemTwilioClient = () => {
  if (!systemClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      logger.error('Twilio credentials not found in environment');
      throw new Error('Twilio credentials not found. Please check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your .env file');
    }
    systemClient = twilio(accountSid, authToken);
  }
  return systemClient;
};

/**
 * Get dynamic Twilio client using user's saved credentials.
 * If user hasn't set one up, it can optionally throw an error or fall back.
 */
export const getTwilioClientForUser = async (userId) => {
  const provider = await ProviderCredential.findOne({ userId, providerName: 'twilio', isDefault: true });
  
  if (!provider) {
    throw new Error('You have not configured your Twilio API credentials. Please add them in Settings.');
  }

  const accountSid = provider.credentials.accountSid;
  const rawAuthToken = decrypt(provider.credentials.authToken);

  if (!accountSid || !rawAuthToken) {
    throw new Error('Invalid Twilio credentials saved. Please re-enter them in Settings.');
  }

  return twilio(accountSid, rawAuthToken);
};

/**
 * Validate Twilio webhook request
 */
export const validateTwilioRequest = (req, res, next) => {
  try {
    const twilioSignature = req.headers['x-twilio-signature'] || '';

    // Get the full URL from the request
    let url = req.protocol + '://' + req.get('host') + req.originalUrl;

    // For ngrok URLs, we need to ensure we're using https and the correct host
    if (req.get('host') && req.get('host').includes('ngrok')) {
      const forwardedProto = req.headers['x-forwarded-proto'] || 'https';
      const forwardedHost = req.headers['x-forwarded-host'] || req.get('host');

      if (forwardedHost) {
        url = `${forwardedProto}://${forwardedHost}${req.path}`;
        if (req.query && Object.keys(req.query).length > 0) {
          const queryString = new URLSearchParams(req.query).toString();
          url = `${url}?${queryString}`;
        }
      }
    }

    // Get POST data
    const postData = req.method === 'POST' ? req.body : {};

    // Skip validation in development/testing
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'testing') {
      logger.debug('Skipping Twilio signature validation (Development Mode)');
      return next();
    }

    // Check if we have Twilio credentials
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      logger.warn('Twilio credentials missing - skipping request validation');
      return next();
    }

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const isValid = validateRequest(authToken, twilioSignature, url, postData);

    if (isValid) {
      logger.debug('Twilio request signature validated successfully');
      return next();
    }

    logger.warn('Invalid Twilio request signature detected');
    return res.status(403).send('Invalid twilio request signature');

  } catch (error) {
    logger.error('Twilio request validation logic error', error);
    return next();
  }
};

export const makeCall = async (to, from, webhookUrl, statusCallbackUrl = null, userId = null) => {
  try {
    logger.info(`Initiating Twilio call to ${to} from ${from}`);

    let twilioClient;
    if (userId) {
      twilioClient = await getTwilioClientForUser(userId);
    } else {
      twilioClient = getSystemTwilioClient();
    }

    const callOptions = {
      method: 'POST',
      url: webhookUrl,
      to: to,
      from: from,
    };

    if (statusCallbackUrl) {
      callOptions.statusCallback = statusCallbackUrl;
      callOptions.statusCallbackEvent = ['initiated', 'ringing', 'answered', 'completed', 'busy', 'failed', 'no-answer'];
      callOptions.statusCallbackMethod = 'POST';
    }

    const call = await twilioClient.calls.create(callOptions);
    logger.success(`Twilio Call Initiated: ${call.sid} [Status: ${call.status}]`);

    return call;
  } catch (error) {
    logger.error('Failed to make Twilio call', error);
    throw error;
  }
};

/**
 * Create TwiML response for voice interactions
 */
export const createTwiMLResponse = () => {
  return new twilio.twiml.VoiceResponse();
};

/**
 * Generate Twilio TTS audio as fallback
 */
export const generateTwilioTTS = async (text, voiceType = 'RACHEL', audioType = 'general') => {
  try {
    logger.debug(`Generating Twilio TTS Fallback preview for ${voiceType}`);

    const twilioVoiceMap = {
      'RACHEL': 'Polly.Joanna',
      'DOMI': 'Polly.Matthew',
      'BELLA': 'Polly.Amy',
      'ANTONI': 'Polly.Brian',
      'THOMAS': 'Polly.Joey',
      'JOSH': 'Polly.Justin'
    };

    const baseUrl = process.env.BASE_URL || '';
    const audioUrl = `${baseUrl}/api/calls/tts-preview?voice=${voiceType}&text=${encodeURIComponent(text)}`;

    return audioUrl;

  } catch (error) {
    logger.error(`Twilio TTS Fallback generation failed`, error);
    throw new Error(`Twilio TTS fallback failed: ${error.message}`);
  }
};

export { getSystemTwilioClient as twilioClient };
export default getSystemTwilioClient;