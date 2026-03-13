import logger from './logger.js';

const REQUIRED_VARS = {
  // Core
  'PORT': { required: false, default: '5001' },
  'NODE_ENV': { required: false, default: 'development' },

  // Database
  'MONGODB_URI': { required: true, description: 'MongoDB connection string' },

  // Authentication
  'JWT_SECRET': { required: true, description: 'JWT secret for token signing' },

  // Twilio (Required for calls)
  'TWILIO_ACCOUNT_SID': { required: true, description: 'Twilio Account SID' },
  'TWILIO_AUTH_TOKEN': { required: true, description: 'Twilio Auth Token' },
  'TWILIO_PHONE_NUMBER': { required: true, description: 'Twilio Phone Number' },

  // AI Services
  'GEMINI_API_KEY': { required: true, description: 'Google Gemini API key for AI summaries' },
  'DEEPGRAM_API_KEY': { required: true, description: 'Deepgram API key for real-time speech-to-text' },

  // Optional
  'ELEVENLABS_API_KEY': { required: false, description: 'ElevenLabs API key for voice synthesis' },
  'BASE_URL': { required: false, description: 'Base URL for webhooks' },
  'NGROK_URL': { required: false, description: 'Ngrok URL for local development' },
};

export function validateEnvironment() {
  logger.info('Validating environment variables...');

  const missing = [];
  const warnings = [];

  for (const [key, config] of Object.entries(REQUIRED_VARS)) {
    const value = process.env[key];

    if (!value || value.trim() === '') {
      if (config.required) {
        missing.push({ key, description: config.description });
      } else if (config.default) {
        warnings.push(`${key} not set, using default: ${config.default}`);
      } else {
        warnings.push(`${key} not set (optional): ${config.description}`);
      }
    } else {
      // Never log the actual value, just that it's set
      logger.debug(`${key}: SET`);
    }
  }

  // Print warnings
  if (warnings.length > 0) {
    warnings.forEach(w => logger.warn(w));
  }

  // Handle missing required variables
  if (missing.length > 0) {
    logger.error('MISSING REQUIRED ENVIRONMENT VARIABLES');
    missing.forEach(({ key, description }) => {
      logger.error(`${key}: ${description}`);
    });
    return false;
  }

  logger.success('All required environment variables are verified');
  return true;
}

export function getEnvSummary() {
  return {
    database: !!process.env.MONGODB_URI,
    twilio: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    deepgram: !!process.env.DEEPGRAM_API_KEY,
    webhooks: !!(process.env.BASE_URL || process.env.NGROK_URL),
  };
}
