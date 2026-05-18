import express from 'express';
import * as callController from '../controllers/callController.js';
import { protect } from '../middleware/auth.js';
import { validateTwilioRequest } from '../config/twilio.js';

const router = express.Router();

// Webhooks (Public but validated)
router.post('/handle-call', validateTwilioRequest, callController.handleCallWebhook);
router.post('/status', callController.handleStatus);

// API Routes
router.use(protect);
router.post('/initiate', callController.initiateCall);
router.post('/browser-sandbox', callController.initiateBrowserSandboxCall);
router.get('/history', callController.getCallHistory);
router.get('/:id', callController.getCallById);

export default router;