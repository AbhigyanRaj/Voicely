import Workspace from '../models/Workspace.js';
import User from '../models/User.js';
import Module from '../models/Module.js';
import Call from '../models/Call.js';
import logger from '../utils/logger.js';

/**
 * Get all workspaces for the authenticated user
 */
export const getWorkspaces = async (req, res) => {
  try {
    const workspaces = await Workspace.find({ userId: req.user._id });
    res.json({ success: true, workspaces });
  } catch (error) {
    logger.error('Error fetching workspaces:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch workspaces' });
  }
};

/**
 * Create a new workspace
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
