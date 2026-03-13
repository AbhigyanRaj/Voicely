import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Production-grade ElevenLabs Configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

// Rate limiting configuration
const RATE_LIMIT = {
  MAX_REQUESTS_PER_MINUTE: 50,
  MAX_REQUESTS_PER_HOUR: 1000,
  RETRY_DELAY_MS: 1000,
  MAX_RETRIES: 3
};

// Request tracking for rate limiting
let requestCounts = {
  minute: { count: 0, resetTime: Date.now() + 60000 },
  hour: { count: 0, resetTime: Date.now() + 3600000 }
};

// Available voices with fallback options
export const VOICES = {
  RACHEL: { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female', quality: 'high' },
  DOMI: { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female', quality: 'high' },
  BELLA: { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', gender: 'female', quality: 'high' },
  ANTONI: { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', gender: 'male', quality: 'high' },
  THOMAS: { id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas', gender: 'male', quality: 'high' },
  JOSH: { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'male', quality: 'high' }
};

// Cache for generated audio files
const audioCache = new Map();
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Rate limiting check
function checkRateLimit() {
  const now = Date.now();

  // Reset counters if time has passed
  if (now > requestCounts.minute.resetTime) {
    requestCounts.minute = { count: 0, resetTime: now + 60000 };
  }
  if (now > requestCounts.hour.resetTime) {
    requestCounts.hour = { count: 0, resetTime: now + 3600000 };
  }

  // Check limits
  if (requestCounts.minute.count >= RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
    throw new Error('Rate limit exceeded: Too many requests per minute');
  }
  if (requestCounts.hour.count >= RATE_LIMIT.MAX_REQUESTS_PER_HOUR) {
    throw new Error('Rate limit exceeded: Too many requests per hour');
  }

  // Increment counters
  requestCounts.minute.count++;
  requestCounts.hour.count++;

  return true;
}

// Enhanced error handling with retry logic
async function makeRequestWithRetry(url, options, retries = RATE_LIMIT.MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logger.debug(`ElevenLabs Attempt ${attempt}/${retries}: ${options.method} ${url}`);

      const response = await fetch(url, options);

      if (response.ok) {
        return response;
      }

      // Handle specific error cases
      if (response.status === 401) {
        const errorText = await response.text();
        logger.error(`ElevenLabs Authentication failed [Status: ${response.status}]`, errorText);
        throw new Error(`Authentication failed: ${errorText}`);
      }

      if (response.status === 429) {
        logger.warn(`ElevenLabs rate limit hit, retrying in ${RATE_LIMIT.RETRY_DELAY_MS * attempt}ms...`);
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.RETRY_DELAY_MS * attempt));
        continue;
      }

      if (response.status >= 500) {
        logger.warn(`ElevenLabs server error [Status: ${response.status}], retrying...`);
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.RETRY_DELAY_MS * attempt));
        continue;
      }

      const errorText = await response.text();
      logger.error(`ElevenLabs Request failed with status ${response.status}`, errorText);
      throw new Error(`Request failed: ${response.status} ${response.statusText}`);

    } catch (error) {
      if (attempt === retries) {
        logger.error(`ElevenLabs request failed after ${retries} attempts`, error);
        throw error;
      }

      logger.warn(`ElevenLabs request attempt ${attempt} failed: ${error.message}. Retrying...`);
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.RETRY_DELAY_MS * attempt));
    }
  }
}

// Test ElevenLabs connection with enhanced error handling
export async function testElevenLabsConnection() {
  try {
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    logger.debug('Testing ElevenLabs connection...');

    const response = await makeRequestWithRetry(`${ELEVENLABS_BASE_URL}/voices`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'User-Agent': 'VokAI-Backend/1.0.0'
      }
    });

    const data = await response.json();
    logger.success(`ElevenLabs connection verified (Available voices: ${data.voices?.length || 0})`);

    return {
      success: true,
      message: 'ElevenLabs connection successful',
      availableVoices: data.voices?.length || 0,
      apiKeyStatus: 'Valid',
      rateLimitInfo: {
        currentMinute: requestCounts.minute.count,
        currentHour: requestCounts.hour.count,
        limits: RATE_LIMIT
      }
    };
  } catch (error) {
    logger.error('ElevenLabs connection test failed', error);
    return {
      success: false,
      message: error.message,
      availableVoices: 0,
      apiKeyStatus: 'Invalid or Error',
      error: error.message
    };
  }
}

// Get voice information with caching
export async function getVoiceInfo(voiceId) {
  try {
    checkRateLimit();

    const cacheKey = `voice_${voiceId}`;
    if (audioCache.has(cacheKey)) {
      const cached = audioCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_EXPIRY) {
        return cached.data;
      }
    }

    logger.debug(`Fetching ElevenLabs voice info for: ${voiceId}`);

    const response = await makeRequestWithRetry(`${ELEVENLABS_BASE_URL}/voices/${voiceId}`, {
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'User-Agent': 'VokAI-Backend/1.0.0'
      }
    });

    const data = await response.json();

    // Cache the result
    audioCache.set(cacheKey, {
      timestamp: Date.now(),
      data: data
    });

    return data;
  } catch (error) {
    logger.error(`Failed to retrieve ElevenLabs voice info for ${voiceId}`, error);
    return null;
  }
}

// Generate speech with production-grade error handling
export async function generateSpeech(text, voiceId = VOICES.RACHEL.id) {
  try {
    checkRateLimit();

    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY not configured');
    }

    logger.debug(`Generating ElevenLabs speech [Voice: ${voiceId}] [Text: ${text.substring(0, 50)}...]`);

    const response = await makeRequestWithRetry(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'User-Agent': 'VokAI-Backend/1.0.0'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2', // Upgraded to v2 for better quality
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    const audioBuffer = await response.arrayBuffer();
    logger.debug(`ElevenLabs speech generated successfully [Size: ${audioBuffer.byteLength} bytes]`);

    return audioBuffer;
  } catch (error) {
    logger.error(`ElevenLabs speech generation failed for voice ${voiceId}`, error);
    throw error;
  }
}

// Generate and save audio file with proper URL handling
export async function generateAndSaveAudio(text, voiceType = 'RACHEL', audioType = 'general') {
  try {
    // Check cache first
    const cacheKey = `${audioType}_${voiceType}_${text}`;
    if (audioCache.has(cacheKey)) {
      const cached = audioCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_EXPIRY) {
        logger.debug(`Using cached ElevenLabs audio for ${voiceType}`);
        return cached.audioUrl;
      } else {
        audioCache.delete(cacheKey);
      }
    }

    const audioBuffer = await generateSpeech(text, VOICES[voiceType]?.id || VOICES.RACHEL.id);

    const filepath = getAudioFilePath(text, voiceType, audioType);
    const buffer = Buffer.from(audioBuffer);
    fs.writeFileSync(filepath, buffer);

    const baseUrl = getBaseUrl();
    const filename = path.basename(filepath);
    const audioUrl = `${baseUrl}/audio/${filename}`;

    // Cache the result
    audioCache.set(cacheKey, {
      audioUrl,
      timestamp: Date.now(),
      filepath
    });

    logger.info(`ElevenLabs audio saved: ${filename}`);

    return audioUrl;
  } catch (error) {
    logger.error(`ElevenLabs audio generation/save failed`, error);
    throw error;
  }
}

// Function to get the appropriate base URL
function getBaseUrl() {
  return process.env.BASE_URL || 'http://localhost:5000';
}

// Function to generate audio file path
function getAudioFilePath(text, voiceType, audioType) {
  const timestamp = Date.now();
  const sanitizedText = text.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const filename = `${audioType}_${voiceType}_${sanitizedText}_${timestamp}.mp3`;
  const filepath = path.join(__dirname, '..', 'audio', filename);

  // Ensure audio directory exists
  const audioDir = path.dirname(filepath);
  if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true });
    logger.debug(`Created audio directory: ${audioDir}`);
  }

  return filepath;
}

// Generate audio with intelligent fallback
export async function generateAndSaveAudioWithFallback(text, voiceType = 'RACHEL', audioType = 'general') {
  try {
    logger.info(`ElevenLabs generation attempt [Voice: ${voiceType}]`);
    const audioUrl = await generateAndSaveAudio(text, voiceType, audioType);

    return {
      success: true,
      audioUrl: audioUrl,
      fallback: false,
      message: 'ElevenLabs audio generated successfully',
      service: 'ElevenLabs',
      voiceType: voiceType
    };
  } catch (error) {
    logger.warn(`ElevenLabs failed, falling back to Twilio TTS...`);

    try {
      const twilioAudioUrl = await generateTwilioTTSFallback(text, voiceType, audioType);

      return {
        success: true,
        audioUrl: twilioAudioUrl,
        fallback: true,
        message: 'Using Twilio TTS fallback due to ElevenLabs failure',
        service: 'Twilio',
        voiceType: voiceType
      };
    } catch (twilioError) {
      logger.error('Critical: Both ElevenLabs and Twilio TTS failed', {
        elevenLabsError: error.message,
        twilioError: twilioError.message
      });

      return {
        success: false,
        fallback: true,
        error: `Both services failed: ElevenLabs (${error.message}), Twilio (${twilioError.message})`,
        message: 'Voice generation failed on all services',
        service: 'None',
        voiceType: voiceType
      };
    }
  }
}

// Generate Twilio TTS fallback audio
async function generateTwilioTTSFallback(text, voiceType, audioType) {
  try {
    const { generateTwilioTTS } = await import('./twilio.js');

    if (typeof generateTwilioTTS !== 'function') {
      throw new Error('Twilio TTS function not available');
    }

    const audioUrl = await generateTwilioTTS(text, voiceType, audioType);
    logger.debug(`Twilio fallback audio generated successfully`);

    return audioUrl;
  } catch (error) {
    logger.error(`Twilio TTS fallback failed`, error);
    throw error;
  }
}

// Simple function to use ElevenLabs for speech
export async function sayWithElevenLabs(text, voiceType = 'RACHEL') {
  try {
    const audioUrl = await generateAndSaveAudio(text, voiceType, 'speech');
    return audioUrl;
  } catch (error) {
    logger.error(`ElevenLabs sayWithElevenLabs failed`, error);
    throw error;
  }
}

// Health check function for production monitoring
export async function healthCheck() {
  try {
    const connectionTest = await testElevenLabsConnection();
    const cacheStats = {
      cacheSize: audioCache.size,
      cacheKeys: Array.from(audioCache.keys())
    };

    return {
      status: connectionTest.success ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      connection: connectionTest,
      cache: cacheStats,
      rateLimits: {
        currentMinute: requestCounts.minute.count,
        currentHour: requestCounts.hour.count,
        limits: RATE_LIMIT
      }
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

// Cleanup function for production
export function cleanup() {
  const now = Date.now();
  for (const [key, value] of audioCache.entries()) {
    if (now - value.timestamp > CACHE_EXPIRY) {
      audioCache.delete(key);
    }
  }

  if (audioCache.size > 0) {
    logger.debug(`ElevenLabs cache cleanup completed [Entries remaining: ${audioCache.size}]`);
  }
}

// Run cleanup every hour
setInterval(cleanup, 60 * 60 * 1000);
