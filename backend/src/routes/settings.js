import express from 'express';
import { protect } from '../middleware/auth.js';
import ProviderCredential from '../models/ProviderCredential.js';
import logger from '../utils/logger.js';
import { encrypt, decrypt } from '../utils/crypto.js';

const router = express.Router();

/**
 * @route   GET /api/settings/providers
 * @desc    Get user's configured call providers (masks the auth token)
 * @access  Private
 */
router.get('/providers', protect, async (req, res) => {
  try {
    const providers = await ProviderCredential.find({ userId: req.user._id });
    
    // Mask auth tokens before sending to frontend
    const maskedProviders = providers.map(p => ({
      _id: p._id,
      providerName: p.providerName,
      isDefault: p.isDefault,
      credentials: {
        accountSid: p.credentials.accountSid,
        phoneNumber: p.credentials.phoneNumber,
        authToken: '********' // Masked
      }
    }));

    res.json({ success: true, providers: maskedProviders });
  } catch (error) {
    logger.error('Error fetching providers:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   GET /api/settings/providers/status
 * @desc    Get an array of configured provider names for the current user
 * @access  Private
 */
router.get('/providers/status', protect, async (req, res) => {
  try {
    const providers = await ProviderCredential.find({ userId: req.user._id });
    const configuredProviders = providers.map(p => p.providerName);
    res.json({ success: true, configuredProviders });
  } catch (error) {
    logger.error('Error fetching provider status:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

/**
 * @route   POST /api/settings/providers
 * @desc    Add or update a call provider credential
 * @access  Private
 */
router.post('/providers', protect, async (req, res) => {
  try {
    const { providerName, accountSid, authToken, phoneNumber } = req.body;

    if (!providerName || !authToken) {
      return res.status(400).json({ success: false, error: 'providerName and authToken (API Key) are required' });
    }

    const validProviders = ['twilio', 'deepgram', 'gemini', 'cartesia', 'sarvam', 'google'];
    if (!validProviders.includes(providerName)) {
      return res.status(400).json({ success: false, error: 'Unsupported provider' });
    }

    if (providerName === 'twilio' && (!accountSid || !phoneNumber)) {
      return res.status(400).json({ success: false, error: 'Twilio requires accountSid and phoneNumber' });
    }

    const encryptedToken = authToken === '********' ? undefined : encrypt(authToken);

    let provider = await ProviderCredential.findOne({ userId: req.user._id, providerName });

    if (provider) {
      // Update existing
      if (accountSid !== undefined) provider.credentials.accountSid = accountSid;
      if (phoneNumber !== undefined) provider.credentials.phoneNumber = phoneNumber;
      if (encryptedToken) {
        provider.credentials.authToken = encryptedToken;
      }
      await provider.save();
    } else {
      // Create new
      provider = await ProviderCredential.create({
        userId: req.user._id,
        providerName,
        credentials: {
          accountSid: accountSid || '',
          authToken: encryptedToken,
          phoneNumber: phoneNumber || ''
        },
        isDefault: true
      });
    }

    res.json({ success: true, message: 'Provider credentials saved successfully' });
  } catch (error) {
    logger.error('Error saving provider:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
