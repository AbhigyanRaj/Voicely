import Call from '../models/Call.js';
import Module from '../models/Module.js';
import * as callService from '../services/callService.js';
import { createTwiMLResponse, addMediaStream } from '../utils/twimlHelpers.js';
import { getTranslation } from '../config/translations.js';
import { formatPhoneNumber } from '../utils/phoneUtils.js';
import { broadcastCallStatus } from '../websocket/liveCallServer.js';
import { sendUpdateByUserId } from '../services/botService.js';
import * as leadService from '../services/leadService.js';
import logger from '../utils/logger.js';
import { getDemoAgentModule } from '../config/demoAgents.js';

/**
 * Initiate a call
 */
export const initiateCall = async (req, res) => {
    try {
        const { moduleId, phoneNumber, customerName, selectedVoice, selectedLanguage, ttsProvider } = req.body;
        const userId = req.user._id;

        logger.info(`Call Initiation Request: [Customer: ${customerName}] [Phone: ${phoneNumber}] [Module: ${moduleId}]`);
        logger.debug(`Call Parameters:`, { selectedVoice, selectedLanguage, ttsProvider, userId });

        if (!phoneNumber || !customerName || !moduleId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const formattedPhone = formatPhoneNumber(phoneNumber);
        if (!formattedPhone) {
            return res.status(400).json({ error: 'Invalid phone number format. Please provide a valid 10-digit Indian number.' });
        }

        const module = await Module.findById(moduleId);
        if (!module) return res.status(404).json({ error: 'Module not found' });

        const finalVoice = selectedVoice || module.selectedVoice || 'NEERJA';
        const finalLanguage = selectedLanguage || module.selectedLanguage || 'en-IN';
        const finalProvider = ttsProvider || module.ttsProvider || 'google';

        const call = await callService.initiateCall({
            moduleId,
            phoneNumber: formattedPhone,
            customerName,
            selectedVoice: finalVoice,
            selectedLanguage: finalLanguage,
            userId
        });

        const callRecord = await Call.create({
            userId,
            workspaceId: req.user.currentWorkspace?._id,
            moduleId,
            customerName: customerName.trim(),
            phoneNumber: formattedPhone,
            twilioCallSid: call.sid,
            selectedVoice: finalVoice,
            selectedLanguage: finalLanguage,
            ttsProvider: finalProvider,
            status: call.status || 'initiated',
            currentStep: 0,
            source: 'web'
        });

        // CRITICAL: Sync call to Lead Journey / Timeline IMMEDIATELY
        // This ensures the dashboard shows "Ringing" progress on the timeline instead of stale data from a previous call.
        try {
            await leadService.syncCallToLead(callRecord);
            logger.info(`Early lead sync successful for Call ${callRecord.twilioCallSid}`);
        } catch (leadErr) {
            logger.error(`Early lead sync failed:`, leadErr);
        }

        broadcastCallStatus(callRecord._id.toString(), 'started', {
            customerName: callRecord.customerName,
            phoneNumber: callRecord.phoneNumber,
            moduleName: module.name
        });

        res.json({ success: true, call: callRecord });
    } catch (error) {
        logger.error('Failed to initiate call', error);
        res.status(500).json({ error: 'Failed to initiate call', message: error.message });
    }
};

/**
 * Initiate a browser sandbox call
 */
export const initiateBrowserSandboxCall = async (req, res) => {
    try {
        const { moduleId, customerName, selectedVoice, selectedLanguage, ttsProvider } = req.body;
        const userId = req.user ? req.user._id : null;
        const workspaceId = req.user && req.user.currentWorkspace ? req.user.currentWorkspace._id : null;

        logger.info(`Browser Sandbox Call Request: [Customer: ${customerName}] [Module: ${moduleId}]`);

        if (!customerName || !moduleId) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let module = null;
        let finalVoice = selectedVoice || 'anushka';
        let finalLanguage = selectedLanguage || 'hi-IN';
        let finalProvider = ttsProvider || 'sarvam';
        const isDemo = typeof moduleId === 'string' && moduleId.startsWith('demo-agent-');

        if (isDemo) {
            const demoDetails = getDemoAgentModule(moduleId);
            module = {
                name: demoDetails.name
            };
        } else {
            module = await Module.findById(moduleId);
            if (!module) return res.status(404).json({ error: 'Module not found' });
            finalVoice = selectedVoice || module.selectedVoice || 'NEERJA';
            finalLanguage = selectedLanguage || module.selectedLanguage || 'en-IN';
            finalProvider = ttsProvider || module.ttsProvider || 'google';
        }

        // Generate a unique browser sandbox Call SID
        const sandboxCallSid = 'browser_sandbox_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);

        const callRecord = await Call.create({
            userId,
            workspaceId,
            moduleId: isDemo ? undefined : moduleId,
            demoAgentId: isDemo ? moduleId : undefined,
            customerName: customerName.trim(),
            phoneNumber: '+1000000000', // Mock Sandbox phone number
            twilioCallSid: sandboxCallSid,
            selectedVoice: finalVoice,
            selectedLanguage: finalLanguage,
            ttsProvider: finalProvider,
            status: 'ringing', // Start as ringing to simulate standard flow
            currentStep: 0,
            source: 'web'
        });

        // Trigger early lead timeline sync
        if (workspaceId) {
            try {
                await leadService.syncCallToLead(callRecord);
                logger.info(`Early lead sync successful for Browser Sandbox Call ${callRecord.twilioCallSid}`);
            } catch (leadErr) {
                logger.error(`Early lead sync failed:`, leadErr);
            }
        }

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
 * Handle Twilio voice webhook
 */
export const handleCallWebhook = async (req, res) => {
    try {
        const { moduleId, CallSid, From, To } = { ...req.query, ...req.body };

        logger.info(`Twilio Webhook Received: [CallSid: ${CallSid}] [From: ${From}] [To: ${To}] [ModuleId: ${moduleId}]`);

        // We respond immediately with the Media Stream TwiML to beat Twilio's 5s timeout.
        // The WebSocket connection will handle the actual logic and module lookup.
        const twiml = createTwiMLResponse();

        // 1. Initiate full bidirectional audio stream to our WebSocket
        addMediaStream(twiml, CallSid);

        // 2. Keep the Twilio call open for up to an hour while WebSocket handles audio
        twiml.pause({ length: 3600 });

        const twimlString = twiml.toString();
        logger.debug(`Generated TwiML for Call ${CallSid}:`, twimlString);
        res.type('text/xml').send(twimlString);
    } catch (error) {
        logger.error('Call webhook processing error', error);
        try {
            const errorTwiml = createTwiMLResponse();
            errorTwiml.say('Sorry, a technical error occurred on our server.');
            res.type('text/xml').send(errorTwiml.toString());
        } catch (innerError) {
            res.status(500).send('Error');
        }
    }
};

/**
 * Handle status updates from Twilio
 */
export const handleStatus = async (req, res) => {
    const { CallSid, CallStatus, CallDuration } = req.body;
    try {
        const call = await Call.findOneAndUpdate(
            { twilioCallSid: CallSid },
            { status: CallStatus, duration: CallDuration },
            { new: true }
        );
        if (call) {
            broadcastCallStatus(call._id.toString(), CallStatus, { duration: CallDuration });

            // Telegram Notification for major status changes
            const evalResult = call.evaluation?.result || 'PENDING';
            const callSummary = call.summary || 'Awaiting post-call analysis.';
            const statusMap = {
                'ringing': 'CALL_STATUS: RINGING',
                'answered': 'CALL_STATUS: ANSWERED',
                'in-progress': 'CALL_STATUS: IN_PROGRESS',
                'completed': `CALL_STATUS: COMPLETED\nDURATION: ${CallDuration}s\nEVALUATION: ${evalResult}\nSUMMARY: ${callSummary}`,
                'failed': 'CALL_STATUS: FAILED',
                'busy': 'CALL_STATUS: BUSY',
                'no-answer': 'CALL_STATUS: NO_ANSWER'
            };

            if (statusMap[CallStatus] && call.source === 'telegram') {
                await sendUpdateByUserId(call.userId, `${statusMap[CallStatus]}\nDEST: ${call.phoneNumber}`);
            }
        }
        res.sendStatus(200);
    } catch (error) {
        logger.error('Status update error', error);
        res.sendStatus(500);
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
            .populate('moduleId', 'name');

        const total = await Call.countDocuments(query);

        res.json({
            success: true,
            calls,
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
            console.warn(`[getCallById] Ownership mismatch! Call.userId: ${call.userId}, Req.user._id: ${req.user._id}`);
            return res.status(403).json({ error: 'Unauthorized access to call' });
        }

        res.json({
            success: true,
            call
        });
    } catch (error) {
        logger.error('Error fetching call', error);
        res.status(500).json({ error: 'Failed to fetch call details' });
    }
};
