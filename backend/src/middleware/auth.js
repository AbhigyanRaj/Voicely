import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { isDBConnected } from '../utils/dbUtils.js';

export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ error: 'Not authorized, no token' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fail closed. This used to substitute getMockUser(decoded.id) whenever the
    // database was unreachable, which turned a Mongo outage into "any validly
    // signed token is a user whose _id is whatever the token claims" -- and the
    // mock's `subscription` was a string where every consumer expects an object.
    // A 503 is the honest answer.
    if (!isDBConnected()) {
      logger.error('Rejecting authenticated request: database unavailable');
      return res.status(503).json({ error: 'Service temporarily unavailable' });
    }

    const user = await User.findById(decoded.id).select('-password').populate('currentWorkspace');
    if (!user) {
      // A validly-signed token for a deleted account. Without this check every
      // downstream `req.user._id` threw, surfacing as a confusing 500.
      return res.status(401).json({ error: 'Not authorized, user no longer exists' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Not authorized, token failed' });
  }
};

export const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
}; 