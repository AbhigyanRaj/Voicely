import User from '../models/User.js';
import Workspace from '../models/Workspace.js';
import Call from '../models/Call.js';
import { generateToken } from '../middleware/auth.js';
import logger from '../utils/logger.js';

/**
 * Helper: build the safe user response object
 */
const buildUserResponse = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  subscription: user.subscription || { tier: 'free', status: 'active' },
  totalCallsMade: user.totalCallsMade,
  currentWorkspace: user.currentWorkspace,
});

/**
 * Create a default workspace for a brand-new user
 */
const ensureDefaultWorkspace = async (user) => {
  const workspace = await Workspace.create({
    userId: user._id,
    name: 'Main Workspace',
    category: 'startup',
  });
  user.currentWorkspace = workspace._id;
  await user.save();
  return workspace;
};

/**
 * POST /api/auth/register  —  Email + password signup
 */
export const emailRegister = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase(),
      password,
    });

    await ensureDefaultWorkspace(user);
    await user.populate('currentWorkspace');

    const token = generateToken(user._id);
    logger.success(`New user registered: ${user.email}`);

    return res.status(201).json({ success: true, user: buildUserResponse(user), token });
  } catch (error) {
    logger.error('Email registration failed', error);
    return res.status(500).json({ error: 'Registration failed', message: error.message });
  }
};

/**
 * POST /api/auth/login  —  Email + password login
 */
export const emailLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Must explicitly select password since it's hidden by default
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password').populate('currentWorkspace');

    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Ensure workspace exists (legacy safety)
    if (!user.currentWorkspace) {
      await ensureDefaultWorkspace(user);
      await user.populate('currentWorkspace');
    }

    const token = generateToken(user._id);
    logger.success(`User logged in: ${user.email}`);

    return res.json({ success: true, user: buildUserResponse(user), token });
  } catch (error) {
    logger.error('Email login failed', error);
    return res.status(500).json({ error: 'Login failed', message: error.message });
  }
};

/**
 * Handles Google OAuth login/signup
 */
export const googleAuth = async (req, res) => {
    try {
        const { email, name, googleId } = req.body;

        if (!email || !name || !googleId) {
            return res.status(400).json({
                error: 'Missing required fields: email, name, and googleId are required'
            });
        }

        let user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            const userName = name && name.trim() ? name.trim() : 'User';
            user = await User.create({
                email: email.toLowerCase(),
                name: userName,
                googleId,
            });

            // Create default workspace for new user
            const defaultWorkspace = await Workspace.create({
                userId: user._id,
                name: 'Main Workspace',
                category: 'startup'
            });

            user.currentWorkspace = defaultWorkspace._id;
            await user.save();
        } else {
            let needsUpdate = false;
            if (!user.googleId) {
                user.googleId = googleId;
                needsUpdate = true;
            }
            if (!user.name || user.name.trim() === '') {
                user.name = name && name.trim() ? name.trim() : 'User';
                needsUpdate = true;
            }
            if (needsUpdate) {
                await user.save();
            }
        }

        const token = generateToken(user._id);

        res.json({
            success: true,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                subscription: user.subscription || { tier: 'free', status: 'active' },
                totalCallsMade: user.totalCallsMade,
                currentWorkspace: user.currentWorkspace,
            },
            token,
        });
    } catch (error) {
        logger.error(`Authentication failed for email: ${req.body?.email || 'unknown'}`, error);
        res.status(500).json({ error: 'Authentication failed', message: error.message });
    }
};

/**
 * Get current user profile
 */
export const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-googleId')
            .populate('currentWorkspace');
        
        if (!user) return res.status(404).json({ error: 'User not found' });

        // If user has no current workspace (legacy user), create one
        if (!user.currentWorkspace) {
            let workspace = await Workspace.findOne({ userId: user._id });
            if (!workspace) {
                workspace = await Workspace.create({
                    userId: user._id,
                    name: 'Main Workspace',
                    category: 'startup'
                });
            }
            user.currentWorkspace = workspace._id;
            await user.save();
            await user.populate('currentWorkspace');
        }

        res.json({
            success: true,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                subscription: user.subscription || { tier: 'free', status: 'active' },
                totalCallsMade: user.totalCallsMade,
                currentWorkspace: user.currentWorkspace,
                isActive: user.isActive,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch profile', message: error.message });
    }
};

/**
 * Update user profile
 */
export const updateProfile = async (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.trim().length === 0) return res.status(400).json({ error: 'Name is required' });

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.name = name.trim();
        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                subscription: user.subscription,
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update profile', message: error.message });
    }
};

/**
 * Get user analytics
 */
export const getAnalytics = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const calls = await Call.find({ userId: user._id, source: { $ne: 'web' } });
        const totalCalls = calls.length;
        const successfulCalls = calls.filter(c => c.status === 'completed' || c.status === 'answered').length;
        const successRate = totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 0;

        res.json({
            success: true,
            analytics: {
                user: {
                    totalCallsMade: user.totalCallsMade || totalCalls,
                    subscription: user.subscription,
                },
                calls: {
                    total: totalCalls,
                    successRate: successRate
                }
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch analytics', message: error.message });
    }
};

/**
 * Get user dashboard summary
 */
export const getDashboard = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const calls = await Call.find({ userId: user._id, source: { $ne: 'web' } });
        const totalCalls = calls.length;
        const successfulCalls = calls.filter(c => c.status === 'completed' || c.status === 'answered').length;
        const successRate = totalCalls > 0 ? Math.round((successfulCalls / totalCalls) * 100) : 0;

        res.json({
            success: true,
            dashboard: {
                user: { name: user.name, email: user.email },
                quickStats: { totalCalls: totalCalls, successRate: successRate }
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
};
