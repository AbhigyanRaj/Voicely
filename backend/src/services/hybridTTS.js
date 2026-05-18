import { generateGoogleTTS, GOOGLE_VOICES, getGoogleTTSUsage } from '../config/googleTTS.js';
import { generateSpeech as generateElevenLabsTTS, VOICES as ELEVENLABS_VOICES } from '../config/elevenlabs.js';
import SarvamService from './sarvamService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Audio storage directory
const AUDIO_DIR = path.join(__dirname, '..', 'audio');

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// TTS Priority Configuration
const TTS_STRATEGY = {
  PRIMARY: 'google',      // Google TTS (Indian voices, free tier)
  FALLBACK: 'twilio'      // Twilio Polly (always available)
};

// Voice mapping between services
const VOICE_MAPPING = {
  // Map generic voice names to service-specific voices
  FEMALE_INDIAN: {
    google: 'NEERJA',
    elevenlabs: 'RACHEL',
    twilio: 'Polly.Aditi'
  },
  MALE_INDIAN: {
    google: 'PRABHAT',
    elevenlabs: 'ANTONI',
    twilio: 'Polly.Raveena'
  },
  FEMALE_INDIAN_ALT: {
    google: 'DIVYA',
    elevenlabs: 'BELLA',
    twilio: 'Polly.Aditi'
  },
  MALE_INDIAN_ALT: {
    google: 'RAVI',
    elevenlabs: 'THOMAS',
    twilio: 'Polly.Raveena'
  },
  // Direct Google TTS voice mappings (for frontend voice selection)
  NEERJA: {
    google: 'NEERJA',
    twilio: 'Polly.Aditi'
  },
  DIVYA: {
    google: 'DIVYA',
    twilio: 'Polly.Aditi'
  },
  ADITI: {
    google: 'ADITI',
    twilio: 'Polly.Aditi'
  },
  PRABHAT: {
    google: 'PRABHAT',
    twilio: 'Polly.Raveena'
  },
  KAVYA: {
    google: 'KAVYA',
    twilio: 'Polly.Raveena'
  },
  RAVI: {
    google: 'RAVI',
    twilio: 'Polly.Raveena'
  },
  // Hindi voice mappings
  NEERJA_HI: {
    google: 'NEERJA_HI',
    twilio: 'Polly.Aditi'
  },
  DIVYA_HI: {
    google: 'DIVYA_HI',
    twilio: 'Polly.Aditi'
  },
  ADITI_HI: {
    google: 'ADITI_HI',
    twilio: 'Polly.Aditi'
  },
  PRABHAT_HI: {
    google: 'PRABHAT_HI',
    twilio: 'Polly.Raveena'
  },
  KAVYA_HI: {
    google: 'KAVYA_HI',
    twilio: 'Polly.Raveena'
  },
  RAVI_HI: {
    google: 'RAVI_HI',
    twilio: 'Polly.Raveena'
  }
};

// Default voice (use specific Google voice for consistency)
const DEFAULT_VOICE = 'NEERJA';

// Usage tracking
let ttsUsageStats = {
  google: { success: 0, failure: 0, totalChars: 0 },
  elevenlabs: { success: 0, failure: 0, totalChars: 0 },
  twilio: { success: 0, failure: 0, totalChars: 0 }
};

/**
 * Generate hash for caching
 */
function generateAudioHash(text, voice, service) {
  return crypto.createHash('md5').update(`${text}_${voice}_${service}`).digest('hex');
}

/**
 * Check if audio file exists in cache
 */
function getCachedAudio(hash) {
  const filepath = path.join(AUDIO_DIR, `${hash}.mp3`);
  if (fs.existsSync(filepath)) {
    logger.debug(`Found cached audio: ${hash}.mp3`);
    return {
      cached: true,
      filepath,
      audioUrl: `/audio/${hash}.mp3`,
      buffer: fs.readFileSync(filepath)
    };
  }
  return null;
}

/**
 * Save audio to cache
 */
function saveToCache(hash, audioBuffer) {
  const filepath = path.join(AUDIO_DIR, `${hash}.mp3`);
  fs.writeFileSync(filepath, audioBuffer);
  logger.debug(`Saved audio to cache: ${hash}.mp3 (${audioBuffer.length} bytes)`);
  return {
    filepath,
    audioUrl: `/audio/${hash}.mp3`
  };
}

/**
 * Smart Hybrid TTS Generator
 * Priority: Google TTS  Twilio Polly
 */
export async function generateHybridTTS(text, voiceType = DEFAULT_VOICE, options = {}) {
  const {
    provider = TTS_STRATEGY.PRIMARY,
    priority = 'auto',
    forceService = null,
    audioType = 'general',
    callId = null,
    languageCode = 'en-IN'
  } = options;

  logger.info(`Hybrid TTS: "${text.substring(0, 50)}..." [Voice: ${voiceType}] [Provider: ${provider}] [Type: ${audioType}]`);

  // Check cache first
  const cacheHash = generateAudioHash(text, voiceType, 'hybrid');
  const cached = getCachedAudio(cacheHash);
  if (cached) {
    return {
      success: true,
      source: 'cache',
      audioBuffer: cached.buffer,
      audioUrl: cached.audioUrl,
      filepath: cached.filepath,
      cached: true
    };
  }

  // Try services in priority order
  const availableServices = [];
  if (provider === 'google') availableServices.push('google');
  if (provider === 'sarvam') availableServices.push('sarvam');
  if (provider === 'elevenlabs') availableServices.push('elevenlabs');

  // Add fallbacks that aren't the primary
  if (provider !== 'sarvam' && process.env.SARVAM_API_KEY) availableServices.push('sarvam');
  if (provider !== 'elevenlabs' && process.env.ELEVENLABS_API_KEY) availableServices.push('elevenlabs');
  if (provider !== 'google' && process.env.GOOGLE_TTS_API_KEY) availableServices.push('google');
  
  availableServices.push('twilio'); // Absolute fallback

  const services = forceService ? [forceService] : availableServices;

  for (const service of services) {
    try {
      logger.debug(`TTS Attempt: ${service.toUpperCase()}`);

      if (service === 'google') {
        const result = await tryGoogleTTS(text, voiceType);
        if (result.success) {
          const saved = saveToCache(cacheHash, result.audioBuffer);
          ttsUsageStats.google.success++;
          ttsUsageStats.google.totalChars += text.length;
          return {
            ...result,
            ...saved,
            cached: false
          };
        }
      } else if (service === 'sarvam') {
        const result = await trySarvamTTS(text, voiceType, languageCode);
        if (result.success) {
          const saved = saveToCache(cacheHash, result.audioBuffer);
          return {
            ...result,
            ...saved,
            cached: false
          };
        }
      } else if (service === 'elevenlabs') {
        const result = await tryElevenLabsTTS(text, voiceType);
        if (result.success) {
          const saved = saveToCache(cacheHash, result.audioBuffer);
          ttsUsageStats.elevenlabs.success++;
          ttsUsageStats.elevenlabs.totalChars += text.length;
          return {
            ...result,
            ...saved,
            cached: false
          };
        }
      } else if (service === 'twilio') {
        // Twilio fallback - return TwiML instruction
        ttsUsageStats.twilio.success++;
        ttsUsageStats.twilio.totalChars += text.length;
        return {
          success: true,
          source: 'twilio',
          useTwiML: true,
          text: text,
          voice: VOICE_MAPPING[voiceType]?.twilio || 'Polly.Aditi',
          language: 'en-IN'
        };
      }
    } catch (error) {
      logger.warn(`${service.toUpperCase()} service fallback triggered`, error.message);
      if (service === 'google') ttsUsageStats.google.failure++;
      if (service === 'elevenlabs') ttsUsageStats.elevenlabs.failure++;
      continue;
    }
  }

  // If all services failed, return Twilio as absolute fallback
  logger.warn('All TTS generators failed/skipped, using Twilio Polly fallback');
  return {
    success: true,
    source: 'twilio',
    useTwiML: true,
    text: text,
    voice: VOICE_MAPPING[voiceType]?.twilio || 'Polly.Aditi',
    language: 'en-IN'
  };
}

/**
 * Try Google TTS
 */
async function tryGoogleTTS(text, voiceType) {
  try {
    const googleVoice = VOICE_MAPPING[voiceType]?.google || 'NEERJA';
    logger.debug(`Voice mapping lookup: ${voiceType} -> ${googleVoice}`);
    logger.debug(`Available in VOICE_MAPPING: ${Object.keys(VOICE_MAPPING).includes(voiceType)}`);

    const audioBuffer = await generateGoogleTTS(text, googleVoice);

    return {
      success: true,
      source: 'google',
      audioBuffer: audioBuffer,
      voiceUsed: googleVoice,
      service: 'Google Cloud TTS'
    };
  } catch (error) {
    logger.error('Google TTS integration error', error);
    return { success: false, error: error.message };
  }
}

/**
 * Try Sarvam AI TTS
 */
async function trySarvamTTS(text, voiceType, languageCode) {
  try {
    const sarvamVoice = VOICE_MAPPING[voiceType]?.sarvam || voiceType; // Fallback to raw string if not expressly mapped
    
    const sarvam = new SarvamService();
    const audioBase64 = await sarvam.synthesizeMulaw(text, languageCode, sarvamVoice);
    
    if (!audioBase64) throw new Error('Null audio returned from Sarvam AI');
    
    return {
      success: true,
      source: 'sarvam',
      audioBuffer: Buffer.from(audioBase64, 'base64'),
      voiceUsed: sarvamVoice,
      service: 'Sarvam AI'
    };
  } catch (error) {
    logger.error('Sarvam TTS integration error', error);
    return { success: false, error: error.message };
  }
}

/**
 * Try ElevenLabs TTS
 */
async function tryElevenLabsTTS(text, voiceType) {
  try {
    const elevenLabsVoice = VOICE_MAPPING[voiceType]?.elevenlabs || 'RACHEL';
    const voiceId = ELEVENLABS_VOICES[elevenLabsVoice]?.id;

    if (!voiceId) {
      throw new Error('Voice ID not found');
    }

    const audioBuffer = await generateElevenLabsTTS(text, voiceId);

    return {
      success: true,
      source: 'elevenlabs',
      audioBuffer: Buffer.from(audioBuffer),
      voiceUsed: elevenLabsVoice,
      service: 'ElevenLabs'
    };
  } catch (error) {
    logger.error('ElevenLabs TTS integration error', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get TTS usage statistics
 */
export function getTTSUsageStats() {
  const googleUsage = getGoogleTTSUsage();

  return {
    google: {
      ...ttsUsageStats.google,
      charactersUsed: googleUsage.charactersUsed,
      charactersRemaining: googleUsage.charactersRemaining,
      percentageUsed: googleUsage.percentageUsed
    },
    elevenlabs: ttsUsageStats.elevenlabs,
    twilio: ttsUsageStats.twilio,
    totalRequests:
      ttsUsageStats.google.success +
      ttsUsageStats.elevenlabs.success +
      ttsUsageStats.twilio.success,
    totalFailures:
      ttsUsageStats.google.failure +
      ttsUsageStats.elevenlabs.failure +
      ttsUsageStats.twilio.failure
  };
}

/**
 * List available voices
 */
export function listAvailableVoices() {
  return Object.entries(VOICE_MAPPING).map(([key, voices]) => ({
    name: key,
    google: voices.google,
    elevenlabs: voices.elevenlabs,
    twilio: voices.twilio,
    description: key.replace(/_/g, ' ').toLowerCase()
  }));
}

/**
 * Test all TTS services
 */
export async function testAllTTSServices() {

  return results;
}

export default {
  generateHybridTTS,
  getTTSUsageStats,
  listAvailableVoices,
  testAllTTSServices,
  VOICE_MAPPING,
  TTS_STRATEGY
};
