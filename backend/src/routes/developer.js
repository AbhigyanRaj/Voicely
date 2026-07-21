import express from 'express';
import { protect } from '../middleware/auth.js';
import DeveloperKey from '../models/DeveloperKey.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { testPipelineLatency } from '../utils/pipelineTest.js';
import { encrypt } from '../utils/crypto.js';

const router = express.Router();

// Mock static options for the developer pipeline builder
const PIPELINE_OPTIONS = {
  stt: [
    { id: 'deepgram-nova', name: 'Deepgram Nova-2', latency: 300, accuracy: 95, provider: 'Deepgram', description: 'Extremely fast and highly accurate STT' },
    { id: 'google-stt', name: 'Google Cloud STT', latency: 450, accuracy: 92, provider: 'Google', description: 'Reliable and robust across multiple languages' },
    { id: 'whisper-large', name: 'OpenAI Whisper v3', latency: 800, accuracy: 98, provider: 'OpenAI', description: 'Highest accuracy, slightly higher latency' },
    { id: 'assembly-ai', name: 'AssemblyAI Conformer', latency: 600, accuracy: 94, provider: 'AssemblyAI', description: 'Great for noisy environments and speaker diarization', isComingSoon: true },
    { id: 'azure-speech', name: 'Azure Speech-to-Text', latency: 400, accuracy: 93, provider: 'Microsoft', description: 'Enterprise-grade speech recognition', isComingSoon: true }
  ],
  llm: [
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', latency: 400, accuracy: 90, provider: 'Google', description: 'Lightning fast reasoning for real-time voice' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', latency: 700, accuracy: 96, provider: 'Google', description: 'Deep reasoning with massive context window' },
    { id: 'gpt-4o', name: 'GPT-4o (Omni)', latency: 550, accuracy: 95, provider: 'OpenAI', description: 'State-of-the-art multimodal reasoning' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', latency: 350, accuracy: 92, provider: 'OpenAI', description: 'Great balance of speed and intelligence' },
    { id: 'claude-3-haiku', name: 'Claude 3.5 Haiku', latency: 300, accuracy: 93, provider: 'Anthropic', description: 'Fast, articulate, and conversational' },
    { id: 'claude-3-sonnet', name: 'Claude 3.5 Sonnet', latency: 600, accuracy: 97, provider: 'Anthropic', description: 'Exceptional intelligence and human-like nuance' },
    { id: 'deepseek-v3', name: 'DeepSeek V3', latency: 450, accuracy: 95, provider: 'DeepSeek', description: 'Highly capable open-weight reasoning model', isComingSoon: true },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', latency: 200, accuracy: 91, provider: 'Groq', description: 'Instant, ultra-low latency open-weights model' }
  ],
  tts: [
    { id: 'sarvam-aura', name: 'Sarvam Aura', latency: 250, accuracy: 94, provider: 'Sarvam', description: 'Optimized for Indian languages and accents' },
    { id: 'elevenlabs-turbo', name: 'ElevenLabs Turbo 2.5', latency: 400, accuracy: 98, provider: 'ElevenLabs', description: 'Most expressive and realistic human voices' },
    { id: 'elevenlabs-flash', name: 'ElevenLabs Flash', latency: 200, accuracy: 92, provider: 'ElevenLabs', description: 'Ultra-low latency for conversational AI' },
    { id: 'cartesia-sonic', name: 'Cartesia Sonic', latency: 150, accuracy: 95, provider: 'Cartesia', description: 'The absolute fastest TTS for real-time applications' },
    { id: 'google-neural', name: 'Google Neural2', latency: 350, accuracy: 90, provider: 'Google', description: 'Consistent and reliable standard TTS' },
    { id: 'playht', name: 'PlayHT 2.0', latency: 450, accuracy: 95, provider: 'PlayHT', description: 'Hyper-realistic emotional voices', isComingSoon: true },
    { id: 'amazon-polly', name: 'Amazon Polly Neural', latency: 400, accuracy: 91, provider: 'Amazon', description: 'AWS Neural voices with deep integrations', isComingSoon: true }
  ]
};

/**
 * @route   GET /api/developer/options
 * @desc    Get dynamic options for the pipeline builder
 * @access  Private
 */
router.get('/options', protect, (req, res) => {
  res.json({ success: true, options: PIPELINE_OPTIONS });
});

/**
 * @route   GET /api/developer/keys
 * @desc    Get user's generated developer keys
 * @access  Private
 */
router.get('/keys', protect, async (req, res) => {
  try {
    const keys = await DeveloperKey.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, keys });
  } catch (error) {
    logger.error('Error fetching developer keys:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   POST /api/developer/keys
 * @desc    Generate a new Developer API Key
 * @access  Private
 */
router.post('/keys', protect, async (req, res) => {
  try {
    const { name, pipelineConfig, providerKeys } = req.body;
    
    if (!pipelineConfig || !pipelineConfig.sttModel || !pipelineConfig.llmModel || !pipelineConfig.ttsModel) {
      return res.status(400).json({ success: false, error: 'Incomplete pipeline configuration' });
    }

    // Encrypt the provider keys
    const encryptedProviderCredentials = new Map();
    if (providerKeys && typeof providerKeys === 'object') {
      for (const [provider, key] of Object.entries(providerKeys)) {
        if (key) {
          encryptedProviderCredentials.set(provider, encrypt(key));
        }
      }
    }

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const rawKey = `vk_dev_${token}`;

    // Hash the token for storage
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    // Create a prefix for display purposes
    const keyPrefix = `vk_dev_${token.substring(0, 4)}...${token.substring(token.length - 4)}`;

    const newKey = await DeveloperKey.create({
      userId: req.user._id,
      keyHash,
      keyPrefix,
      name: name || 'Custom Pipeline',
      pipelineConfig,
      providerCredentials: encryptedProviderCredentials
    });

    // Test the pipeline latency
    const actualLatency = await testPipelineLatency(pipelineConfig, PIPELINE_OPTIONS);

    // Send the raw key ONLY once. It cannot be retrieved again.
    res.json({
      success: true,
      message: 'API Key generated successfully',
      key: rawKey,
      keyRecord: newKey,
      actualLatency
    });

  } catch (error) {
    logger.error('Error generating developer key:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   DELETE /api/developer/keys/:id
 * @desc    Delete a developer key
 * @access  Private
 */
router.delete('/keys/:id', protect, async (req, res) => {
  try {
    const key = await DeveloperKey.findOne({ _id: req.params.id, userId: req.user._id });
    if (!key) {
      return res.status(404).json({ success: false, error: 'Key not found' });
    }
    await key.deleteOne();
    res.json({ success: true, message: 'Key deleted' });
  } catch (error) {
    logger.error('Error deleting developer key:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
