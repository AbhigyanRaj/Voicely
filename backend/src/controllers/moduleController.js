import Module from '../models/Module.js';

/**
 * Get all modules for a user
 */
export const getModules = async (req, res) => {
    try {
        const query = { userId: req.user._id, isDeleted: false };
        if (req.user.currentWorkspace) {
            query.workspaceId = req.user.currentWorkspace._id;
        }
        const modules = await Module.find(query);
        res.json({ success: true, modules });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch modules', message: error.message });
    }
};

/**
 * Create a new module
 */
export const createModule = async (req, res) => {
    try {
        const { name, type, questions, systemPrompt, ttsProvider, selectedLanguage, selectedVoice } = req.body;
        if (!name) return res.status(400).json({ error: 'Module name is required' });

        const moduleData = {
            userId: req.user._id,
            workspaceId: req.user.currentWorkspace?._id,
            name,
            type: type || 'custom',
            questions: questions || [],
            systemPrompt: systemPrompt || ''
        };
        if (ttsProvider) moduleData.ttsProvider = ttsProvider;
        if (selectedLanguage) moduleData.selectedLanguage = selectedLanguage;
        if (selectedVoice) moduleData.selectedVoice = selectedVoice;

        const module = await Module.create(moduleData);

        res.status(201).json({ success: true, module });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create module', message: error.message });
    }
};

/**
 * Get single module by ID
 */
export const getModuleById = async (req, res) => {
    try {
        const query = { _id: req.params.id, userId: req.user._id };
        if (req.user.currentWorkspace) {
            query.workspaceId = req.user.currentWorkspace._id;
        }
        const module = await Module.findOne(query);
        if (!module) return res.status(404).json({ error: 'Module not found' });
        res.json({ success: true, module });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch module', message: error.message });
    }
};

/**
 * Update module
 */
export const updateModule = async (req, res) => {
    try {
        const query = { _id: req.params.id, userId: req.user._id };
        if (req.user.currentWorkspace) {
            query.workspaceId = req.user.currentWorkspace._id;
        }
        const module = await Module.findOneAndUpdate(
            query,
            req.body,
            { new: true }
        );
        if (!module) return res.status(404).json({ error: 'Module not found' });
        res.json({ success: true, module });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update module', message: error.message });
    }
};

/**
 * Delete module (soft delete)
 */
export const deleteModule = async (req, res) => {
    try {
        const query = { _id: req.params.id, userId: req.user._id };
        if (req.user.currentWorkspace) {
            query.workspaceId = req.user.currentWorkspace._id;
        }
        const module = await Module.findOneAndUpdate(
            query,
            { isDeleted: true },
            { new: true }
        );
        if (!module) return res.status(404).json({ error: 'Module not found' });
        res.json({ success: true, message: 'Module deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete module', message: error.message });
    }
};
