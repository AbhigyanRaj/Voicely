import express from 'express';
import { protect } from '../middleware/auth.js';
import ProviderCredential from '../models/ProviderCredential.js';
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
    console.error('Error fetching providers:', error);
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

    if (!providerName || !accountSid || !authToken || !phoneNumber) {
      return res.status(400).json({ success: false, error: 'All fields are required' });
    }

    if (providerName !== 'twilio') {
      return res.status(400).json({ success: false, error: 'Unsupported provider' });
    }

    const encryptedToken = authToken === '********' ? undefined : encrypt(authToken);

    let provider = await ProviderCredential.findOne({ userId: req.user._id, providerName });

    if (provider) {
      // Update existing
      provider.credentials.accountSid = accountSid;
      provider.credentials.phoneNumber = phoneNumber;
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
          accountSid,
          authToken: encryptedToken,
          phoneNumber
        },
        isDefault: true
      });
    }

    res.json({ success: true, message: 'Provider credentials saved successfully' });
  } catch (error) {
    console.error('Error saving provider:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
