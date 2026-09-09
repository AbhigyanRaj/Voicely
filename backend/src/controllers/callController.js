import Call from '../models/Call.js';
import Module from '../models/Module.js';
import { broadcastCallStatus } from '../websocket/liveCallServer.js';
import logger from '../utils/logger.js';
import { getDemoAgentModule } from '../config/demoAgents.js';


// Cartesia "Kendra". Voice ids are UUIDs and are passed to the provider verbatim.
const DEFAULT_VOICE_ID = '79a125e8-cd45-4c13-8a67-188112f4dd22';
const DEFAULT_LANGUAGE = 'en-US';
const VOICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Fall back to the default when a stored voice is not a Cartesia UUID -- e.g. a
 * legacy 'NEERJA' or 'anushka' from the Google/Sarvam era, which Cartesia
 * rejects, producing a session with no audio.
 */
const resolveVoiceId = (voice) => (voice && VOICE_ID_PATTERN.test(voice) ? voice : DEFAULT_VOICE_ID);

/**
 * Initiate a browser sandbox call
 */
export const initiateBrowserSandboxCall = async (req, res) => {
    try {
        const { moduleId, customerName, selectedVoice, selectedLanguage, ttsProvider, optimizeFor } = req.body;
        const userId = req.user ? req.user._id : null;
        const workspaceId = req.user && req.user.currentWorkspace ? req.user.currentWorkspace._id : null;

        logger.info(`Browser Sandbox Call Request: [Customer: ${customerName}] [Module: ${moduleId}] [OptimizeFor: ${optimizeFor}]`);

        if (!customerName || !moduleId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let module = null;
        // These defaults previously named Sarvam/Hindi -- a deleted provider and
        // an unsupported language. 'anushka' is a Sarvam speaker name, which
        // Cartesia rejects as a voice id, so an API caller that omitted a voice
        // got a session that played no audio at all.
        let finalVoice = selectedVoice || DEFAULT_VOICE_ID;
        let finalLanguage = selectedLanguage || DEFAULT_LANGUAGE;
        let finalProvider = ttsProvider || 'cartesia';
        const isDemo = typeof moduleId === 'string' && moduleId.startsWith('demo-agent-');

        if (isDemo) {
            const demoDetails = getDemoAgentModule(moduleId);
            module = {
                name: demoDetails.name
            };
        } else {
            module = await Module.findById(moduleId);
            if (!module) return res.status(404).json({ error: 'Module not found' });
            // A module saved before the Cartesia migration may still carry a
            // Google/Sarvam voice name, so validate rather than trust it.
            finalVoice = resolveVoiceId(selectedVoice || module.selectedVoice);
            finalLanguage = selectedLanguage || module.selectedLanguage || DEFAULT_LANGUAGE;
            finalProvider = 'cartesia';
        }

        // Generate a unique browser sandbox Call SID
        const sandboxCallSid = 'browser_sandbox_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);

        const callRecord = await Call.create({
            userId,
            workspaceId,
            moduleId: isDemo ? undefined : moduleId,
            moduleName: module.name,
            demoAgentId: isDemo ? moduleId : undefined,
            customerName: customerName.trim(),
            phoneNumber: '+1000000000', // Mock Sandbox phone number
            twilioCallSid: sandboxCallSid,
            selectedVoice: finalVoice,
            selectedLanguage: finalLanguage,
            ttsProvider: finalProvider,
            optimizeFor: optimizeFor || 'latency',
            status: 'ringing', // Start as ringing to simulate standard flow
            currentStep: 0,
            source: 'web'
        });

        broadcastCallStatus(callRecord._id.toString(), 'started', {
            customerName: callRecord.customerName,
            phoneNumber: callRecord.phoneNumber,
            moduleName: module.name
        });

        res.json({ success: true, call: callRecord });
    } catch (error) {
        logger.error('Failed to initiate browser sandbox call', error);
        res.status(500).json({ error: 'Failed to initiate browser sandbox call', message: error.message });
    }
};




/**
 * Get call history with pagination
 */
export const getCallHistory = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const query = { userId: req.user._id };
        if (req.user.currentWorkspace) {
            query.workspaceId = req.user.currentWorkspace._id;
        }

        const calls = await Call.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('moduleId', 'name')
            .lean();

        const total = await Call.countDocuments(query);

        // Patch response to avoid frontend crashes if module was deleted
        const formattedCalls = calls.map(callObj => {
            if (!callObj.moduleId && callObj.moduleName) {
                callObj.moduleId = { name: `${callObj.moduleName} (Deleted)` };
            } else if (!callObj.moduleId) {
                callObj.moduleId = { name: 'Deleted Module' };
            }
            return callObj;
        });

        res.json({
            success: true,
            calls: formattedCalls,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error('Error fetching call history', error);
        res.status(500).json({ error: 'Failed to fetch history' });
    }
};

/**
 * Get single call details
 */
export const getCallById = async (req, res) => {
    try {
        const call = await Call.findById(req.params.id)
            .populate('moduleId', 'name');
            
        if (!call) {
            return res.status(404).json({ error: 'Call not found' });
        }

        // Check ownership
        if (call.userId.toString() !== req.user._id.toString()) {
            logger.warn(`[getCallById] Ownership mismatch! Call.userId: ${call.userId}, Req.user._id: ${req.user._id}`);
            return res.status(403).json({ error: 'Unauthorized access to call' });
        }

        // Patch response to avoid frontend crashes if module was deleted
        const callObj = call.toObject();
        if (!callObj.moduleId && callObj.moduleName) {
            callObj.moduleId = { name: `${callObj.moduleName} (Deleted)` };
        } else if (!callObj.moduleId) {
            callObj.moduleId = { name: 'Deleted Module' };
        }

        res.json({
            success: true,
            call: callObj
        });
    } catch (error) {
        logger.error('Error fetching call', error);
        res.status(500).json({ error: 'Failed to fetch call details' });
    }
};
