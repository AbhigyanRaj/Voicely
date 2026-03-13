import Call from '../models/Call.js';
import Module from '../models/Module.js';
import * as callService from '../services/callService.js';
import { createTwiMLResponse, addMediaStream } from '../utils/twimlHelpers.js';
import { getTranslation } from '../config/translations.js';
import { formatPhoneNumber } from '../utils/phoneUtils.js';
import { broadcastCallStatus } from '../websocket/liveCallServer.js';
import { sendUpdateByUserId } from '../services/botService.js';
import logger from '../utils/logger.js';

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

        broadcastCallStatus(callRecord._id.toString(), 'started', {
            customerName: callRecord.customerName,
            phoneNumber: callRecord.phoneNumber,
            moduleName: module.name
        });

        // Telegram Notification
        await sendUpdateByUserId(userId, `CALL_STATUS: INITIATED\nMODULE: ${module.name.toUpperCase()}\nCUSTOMER: ${customerName.toUpperCase()}\nDEST: ${formattedPhone}`);

        res.json({ success: true, call: callRecord });
    } catch (error) {
        logger.error('Failed to initiate call', error);
        res.status(500).json({ error: 'Failed to initiate call', message: error.message });
    }
};

/**
 * Handle Twilio voice webhook
 */
export const handleCallWebhook = async (req, res) => {
    try {
        const { moduleId, CallSid, From, To } = { ...req.query, ...req.body };

        logger.info(`Twilio Webhook Received: [CallSid: ${CallSid}] [From: ${From}] [To: ${To}] [ModuleId: ${moduleId}]`);

        const module = await Module.findById(moduleId);
        if (!module) {
            logger.warn(`Module lookup failed for ID: ${moduleId}. Sending error TwiML to Twilio.`);
            const errorTwiml = createTwiMLResponse();
            errorTwiml.say('Sorry, an error occurred.');
            return res.type('text/xml').send(errorTwiml.toString());
        }

        const twiml = createTwiMLResponse();

        // 1. Initiate full bidirectional audio stream to our WebSocket
        addMediaStream(twiml, req.body.CallSid);

        // 2. Keep the Twilio call open for up to an hour while WebSocket handles audio
        twiml.pause({ length: 3600 });

        const twimlString = twiml.toString();
        logger.debug(`Generated TwiML for Call ${req.body.CallSid}:`, twimlString);
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
