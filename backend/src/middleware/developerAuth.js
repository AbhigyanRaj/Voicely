import crypto from 'crypto';
import DeveloperKey from '../models/DeveloperKey.js';
import User from '../models/User.js';

/**
 * Middleware to authenticate Developer API Keys (vk_dev_...)
 */
export const developerAuth = async (req, res, next) => {
  try {
    let token;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token || !token.startsWith('vk_dev_')) {
      return res.status(401).json({ success: false, error: 'Not authorized to access this route. Invalid token format.' });
    }

    // Hash the token
    const keyHash = crypto.createHash('sha256').update(token).digest('hex');

    // Find the developer key in DB
    const developerKey = await DeveloperKey.findOne({ keyHash });

    if (!developerKey) {
      return res.status(401).json({ success: false, error: 'Not authorized to access this route. Key not found or revoked.' });
    }

    // Update last used at
    developerKey.lastUsedAt = Date.now();
    await developerKey.save();

    // Attach user and developerKey to request
    req.user = await User.findById(developerKey.userId);
    req.developerKey = developerKey;

    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authorized. User no longer exists.' });
    }

    next();
  } catch (error) {
    console.error('Developer Auth Error:', error);
    res.status(500).json({ success: false, error: 'Server error during authentication' });
  }
};
