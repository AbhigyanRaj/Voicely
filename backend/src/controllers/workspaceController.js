import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import Module from '../models/Module.js';
import Call from '../models/Call.js';
import logger from '../utils/logger.js';
import cacheUtils from '../utils/cacheUtils.js';

/**
 * Fetches all workspaces for the authenticated user with pagination.
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export const getWorkspaces = async (req, res) => {
  try {
    const userId = req.user._id;
    const cacheKey = `workspaces_${userId}`;

    // Try to get from cache first
    const cachedWorkspaces = await cacheUtils.getCache(cacheKey);
    if (cachedWorkspaces) {
      return res.json({ success: true, count: cachedWorkspaces.length, data: cachedWorkspaces });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const workspaces = await Workspace.find({ userId: req.user._id })
      .skip(skip)
      .limit(limit)
      .lean();

    // Cache the result for 5 minutes
    await cacheUtils.setCache(cacheKey, workspaces, 300);

    const total = await Workspace.countDocuments({ userId: req.user._id });

    res.json({ 
      success: true, 
      workspaces,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    logger.error('Error fetching workspaces:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch workspaces' });
  }
};

/**
 * Creates a new workspace for the authenticated user.
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export const createWorkspace = async (req, res) => {
  try {
    const { name, category } = req.body;
    
    if (!name || !category) {
      return res.status(400).json({ success: false, error: 'Name and category are required' });
    }

    const workspace = await Workspace.create({
      userId: req.user._id,
      name,
      category
    });

    // If this is the user's first workspace, make it current
    const user = await User.findById(req.user._id);
    if (!user.currentWorkspace) {
      user.currentWorkspace = workspace._id;
      await user.save();
    }

    res.status(201).json({ success: true, workspace });
  } catch (error) {
    logger.error('Error creating workspace:', error);
    res.status(500).json({ success: false, error: 'Failed to create workspace' });
  }
};

/**
 * Updates an existing workspace.
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 */
export const updateWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.body;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID is required' });
    }
    // ... logic would follow
  } catch (error) {
    logger.error('Error updating workspace:', error);
    res.status(500).json({ success: false, error: 'Failed to update workspace' });
  }
};

/**
 * Switch the active workspace
 */
export const switchWorkspace = async (req, res) => {
  try {
    const { workspaceId } = req.body;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID is required' });
    }

    const workspace = await Workspace.findOne({ _id: workspaceId, userId: req.user._id });
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    const user = await User.findById(req.user._id);
    user.currentWorkspace = workspace._id;
    await user.save();

    res.json({ 
      success: true, 
      message: 'Workspace switched successfully',
      currentWorkspace: workspace
    });
  } catch (error) {
    logger.error('Error switching workspace:', error);
    res.status(500).json({ success: false, error: 'Failed to switch workspace' });
  }
};

/**
 * Get analytics for a specific workspace
 */
export const getWorkspaceAnalytics = async (req, res) => {
  try {
    const { workspaceId } = req.params;
    
    const workspace = await Workspace.findOne({ _id: workspaceId, userId: req.user._id });
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found' });
    }

    // This is a placeholder for actual complex aggregation 
    // Usually, we'd filter modules and calls by workspaceId
    const modules = await Module.find({ workspaceId: workspace._id });
    const calls = await Call.find({ workspaceId: workspace._id });

    res.json({
      success: true,
      workspace: {
        name: workspace.name,
        category: workspace.category
      },
      stats: {
        totalModules: modules.length,
        totalCalls: calls.length,
        // ... more specific analytics based on category ...
      }
    });
  } catch (error) {
    logger.error('Error fetching workspace analytics:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch workspace analytics' });
  }
};
