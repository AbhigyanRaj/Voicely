import express from 'express';
import { protect } from '../middleware/auth.js';
import DeveloperKey from '../models/DeveloperKey.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';
import { encrypt } from '../utils/crypto.js';

const router = express.Router();

/**
 * What a developer key can actually change.
 *
 * This block used to hold twenty "models" with a `latency` and an `accuracy`
 * on each -- Claude 3.5 Sonnet at 97%, Cartesia Sonic at 150ms -- none of them
 * measured, and the dashboard summed and averaged them into an "Estimated
 * Latency" and an "Average Accuracy" it showed as fact. Two of the entries were
 * already decommissioned, including the llama model whose removal took the
 * whole pipeline down.
 *
 * Only the LLM is really selectable: developerStreamServer routes on the model
 * string. STT is Deepgram and TTS is Cartesia, both fixed in that file, so
 * offering a choice of either was decoration. No latency or accuracy figures
 * appear here, because none have been measured per model.
 */
const LLM_OPTIONS = [
  { id: 'qwen/qwen3.8-27b', name: 'Qwen3.8 27B', provider: 'Groq', note: 'What Voicely itself runs' },
  { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', provider: 'Groq' },
  { id: 'gpt-4o-mini', name: 'GPT-4o mini', provider: 'OpenAI' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google' },
];

/** Fixed, because developerStreamServer hardcodes both. */
const FIXED_STT_MODEL = 'nova-3';
const FIXED_TTS_MODEL = 'sonic-3.5';

/**
 * @route   GET /api/developer/options
 * @desc    What a key may be configured with
 * @access  Private
 */
router.get('/options', protect, (req, res) => {
  res.json({
    success: true,
    options: {
      llm: LLM_OPTIONS,
      stt: { model: FIXED_STT_MODEL, provider: 'Deepgram', fixed: true },
      tts: { model: FIXED_TTS_MODEL, provider: 'Cartesia', fixed: true },
    },
  });
});

/**
 * @route   GET /api/developer/keys
 * @desc    Get user's generated developer keys
 * @access  Private
 */
router.get('/keys', protect, async (req, res) => {
  try {
    // Explicit projection. `select: false` on the schema already hides the hash
    // and the credentials; naming the fields keeps it that way if the schema
    // changes.
    const keys = await DeveloperKey.find({ userId: req.user._id })
      .select('name keyPrefix pipelineConfig createdAt updatedAt lastUsedAt')
      .sort({ createdAt: -1 });
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

    // Only the LLM is a choice. STT and TTS are filled in from what the stream
    // server actually uses rather than demanded from a caller who has no say.
    const llmModel = pipelineConfig?.llmModel;
    if (!llmModel || !LLM_OPTIONS.some(o => o.id === llmModel)) {
      return res.status(400).json({
        success: false,
        error: 'Unknown llmModel',
        supported: LLM_OPTIONS.map(o => o.id),
      });
    }
    const resolvedConfig = {
      sttModel: FIXED_STT_MODEL,
      llmModel,
      ttsModel: FIXED_TTS_MODEL,
    };

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
    // Leading characters only. The previous form also exposed the token's *last*
    // four, which is real key material shown in the UI and stored in the clear.
    const keyPrefix = `vk_dev_${token.substring(0, 6)}...`;

    const newKey = await DeveloperKey.create({
      userId: req.user._id,
      keyHash,
      keyPrefix,
      name: name || 'Custom Pipeline',
      pipelineConfig: resolvedConfig,
      providerCredentials: encryptedProviderCredentials
    });

    // Send the raw key ONLY once. It cannot be retrieved again.
    res.json({
      success: true,
      message: 'API Key generated successfully',
      key: rawKey,
      // A public projection, not the document: the raw model carried keyHash and
      // the encrypted providerCredentials map.
      keyRecord: {
        _id: newKey._id,
        name: newKey.name,
        keyPrefix: newKey.keyPrefix,
        pipelineConfig: newKey.pipelineConfig,
        createdAt: newKey.createdAt,
      },
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
