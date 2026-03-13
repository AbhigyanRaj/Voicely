import textToSpeech from '@google-cloud/text-to-speech';
import fetch from 'node-fetch';
import logger from '../utils/logger.js';

// Google Cloud TTS Configuration
const getApiKey = () => process.env.GOOGLE_TTS_API_KEY || process.env.GOOGLE_API_KEY;
const GOOGLE_TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

// Available Indian English voices
export const GOOGLE_VOICES = {
  // English voices
  NEERJA: {
    id: 'en-IN-Neural2-A',
    name: 'Neerja',
    gender: 'FEMALE',
    type: 'Neural2',
    language: 'en-IN',
    description: 'Indian English Female (Premium)'
  },
  PRABHAT: {
    id: 'en-IN-Neural2-B',
    name: 'Prabhat',
    gender: 'MALE',
    type: 'Neural2',
    language: 'en-IN',
    description: 'Indian English Male (Premium)'
  },
  KAVYA: {
    id: 'en-IN-Neural2-C',
    name: 'Kavya',
    gender: 'MALE',
    type: 'Neural2',
    language: 'en-IN',
    description: 'Indian English Male Alt (Premium)'
  },
  DIVYA: {
    id: 'en-IN-Neural2-D',
    name: 'Divya',
    gender: 'FEMALE',
    type: 'Neural2',
    language: 'en-IN',
    description: 'Indian English Female Alt (Premium)'
  },
  ADITI: {
    id: 'en-IN-Wavenet-A',
    name: 'Aditi',
    gender: 'FEMALE',
    type: 'Wavenet',
    language: 'en-IN',
    description: 'Indian English Female (High Quality)'
  },
  RAVI: {
    id: 'en-IN-Wavenet-B',
    name: 'Ravi',
    gender: 'MALE',
    type: 'Wavenet',
    language: 'en-IN',
    description: 'Indian English Male (High Quality)'
  },
  // Hindi voices
  NEERJA_HI: {
    id: 'hi-IN-Neural2-A',
    name: 'Neerja',
    gender: 'FEMALE',
    type: 'Neural2',
    language: 'hi-IN',
    description: 'Hindi Female (Premium)'
  },
  PRABHAT_HI: {
    id: 'hi-IN-Neural2-B',
    name: 'Prabhat',
    gender: 'MALE',
    type: 'Neural2',
    language: 'hi-IN',
    description: 'Hindi Male (Premium)'
  },
  KAVYA_HI: {
    id: 'hi-IN-Neural2-C',
    name: 'Kavya',
    gender: 'MALE',
    type: 'Neural2',
    language: 'hi-IN',
    description: 'Hindi Male Alt (Premium)'
  },
  DIVYA_HI: {
    id: 'hi-IN-Neural2-D',
    name: 'Divya',
    gender: 'FEMALE',
    type: 'Neural2',
    language: 'hi-IN',
    description: 'Hindi Female Alt (Premium)'
  },
  ADITI_HI: {
    id: 'hi-IN-Wavenet-A',
    name: 'Aditi',
    gender: 'FEMALE',
    type: 'Wavenet',
    language: 'hi-IN',
    description: 'Hindi Female (High Quality)'
  },
  RAVI_HI: {
    id: 'hi-IN-Wavenet-B',
    name: 'Ravi',
    gender: 'MALE',
    type: 'Wavenet',
    language: 'hi-IN',
    description: 'Hindi Male (High Quality)'
  },
  // Additional Standard Voices (High character limit)
  NEERJA_STD: {
    id: 'en-IN-Standard-A',
    name: 'Neerja (Lite)',
    gender: 'FEMALE',
    type: 'Standard',
    language: 'en-IN',
    description: 'Indian English Female (Standard)'
  },
  PRABHAT_STD: {
    id: 'en-IN-Standard-B',
    name: 'Prabhat (Lite)',
    gender: 'MALE',
    type: 'Standard',
    language: 'en-IN',
    description: 'Indian English Male (Standard)'
  },
  NEERJA_HI_STD: {
    id: 'hi-IN-Standard-A',
    name: 'Neerja (Lite)',
    gender: 'FEMALE',
    type: 'Standard',
    language: 'hi-IN',
    description: 'Hindi Female (Standard)'
  },
  PRABHAT_HI_STD: {
    id: 'hi-IN-Standard-B',
    name: 'Prabhat (Lite)',
    gender: 'MALE',
    type: 'Standard',
    language: 'hi-IN',
    description: 'Hindi Male (Standard)'
  }
};

// Usage tracking
let usageStats = {
  charactersUsed: 0,
  requestCount: 0,
  lastReset: new Date(),
  errors: 0,
  successes: 0
};

/**
 * Generate speech using Google Cloud Text-to-Speech API
 */
export async function generateGoogleTTS(text, voiceType = 'NEERJA', options = {}) {
  const GOOGLE_TTS_API_KEY = getApiKey();
  if (!GOOGLE_TTS_API_KEY) {
    throw new Error('Google TTS API key not configured');
  }

  const voice = GOOGLE_VOICES[voiceType] || GOOGLE_VOICES.NEERJA;

  const {
    speakingRate = 1.0,
    pitch = 0.0,
    volumeGainDb = 0.0,
  } = options;

  logger.debug(`Generating Google TTS [Voice: ${voice.name}] [Text: ${text.substring(0, 50)}...]`);

  try {
    const requestBody = {
      input: { text: text },
      voice: {
        languageCode: voice.language,
        name: voice.id,
        ssmlGender: voice.gender
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: speakingRate,
        pitch: pitch,
        volumeGainDb: volumeGainDb,
        sampleRateHertz: 24000
      }
    };

    const response = await fetch(`${GOOGLE_TTS_ENDPOINT}?key=${GOOGLE_TTS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Google TTS API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();

    if (!data.audioContent) {
      throw new Error('No audio content in Google TTS response');
    }

    const audioBuffer = Buffer.from(data.audioContent, 'base64');

    // Update usage stats
    usageStats.charactersUsed += text.length;
    usageStats.requestCount++;
    usageStats.successes++;

    logger.debug(`Google TTS generated successfully [Size: ${audioBuffer.length} bytes]`);

    return audioBuffer;

  } catch (error) {
    usageStats.errors++;
    logger.error('Google TTS generation failed', error);
    throw error;
  }
}

/**
 * Test Google TTS connection and API key
 */
export async function testGoogleTTS() {
  const GOOGLE_TTS_API_KEY = getApiKey();
  logger.debug('Testing Google TTS connectivity...');

  if (!GOOGLE_TTS_API_KEY) {
    logger.error('Google TTS Test Failed: API key not configured');
    return { success: false, error: 'API key not configured' };
  }

  try {
    const testText = 'Hello! This is a test of Google Text to Speech.';
    const audioBuffer = await generateGoogleTTS(testText, 'NEERJA');

    logger.success('Google TTS connectivity verified');

    return {
      success: true,
      audioSize: audioBuffer.length,
      textLength: testText.length,
      voice: GOOGLE_VOICES.NEERJA,
      message: 'Google TTS is working perfectly!'
    };
  } catch (error) {
    logger.error('Google TTS connectivity test failed', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get usage statistics
 */
export function getGoogleTTSUsage() {
  const freeMonthlyLimit = 1000000;
  const percentageUsed = (usageStats.charactersUsed / freeMonthlyLimit) * 100;

  return {
    ...usageStats,
    freeMonthlyLimit,
    charactersRemaining: freeMonthlyLimit - usageStats.charactersUsed,
    percentageUsed: percentageUsed.toFixed(2),
    estimatedCost: usageStats.charactersUsed > freeMonthlyLimit
      ? ((usageStats.charactersUsed - freeMonthlyLimit) / 1000000 * 16).toFixed(2)
      : 0
  };
}

/**
 * Reset usage statistics
 */
export function resetGoogleTTSUsage() {
  usageStats = {
    charactersUsed: 0,
    requestCount: 0,
    lastReset: new Date(),
    errors: 0,
    successes: 0
  };
  logger.info('Google TTS usage statistics has been reset');
}

/**
 * List all available voices
 */
export function listGoogleVoices() {
  return Object.entries(GOOGLE_VOICES).map(([key, voice]) => ({
    key,
    ...voice
  }));
}

export default {
  generateGoogleTTS,
  testGoogleTTS,
  getGoogleTTSUsage,
  resetGoogleTTSUsage,
  listGoogleVoices,
  GOOGLE_VOICES
};
