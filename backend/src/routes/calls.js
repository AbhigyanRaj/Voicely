import express from 'express';
import * as callController from '../controllers/callController.js';
import { protect } from '../middleware/auth.js';
import { validateTwilioRequest } from '../config/twilio.js';
import { validateRequest } from '../middleware/validator.js';
import { callInitiateLimiter } from '../middleware/rateLimiter.js';
import { initiateCallSchema } from '../validators/callValidator.js';

const router = express.Router();

// Webhooks (Public but validated)
router.post('/handle-call', validateTwilioRequest, callController.handleCallWebhook);
router.post('/handle-developer-call', validateTwilioRequest, callController.handleDeveloperCallWebhook);
router.post('/status', validateTwilioRequest, callController.handleStatus);

// API Routes (Optional protect for sandbox calls)
router.post('/browser-sandbox', (req, res, next) => {
    if (req.headers.authorization) {
        return protect(req, res, next);
    }
    next();
}, callController.initiateBrowserSandboxCall);

router.use(protect);
router.post('/initiate', callInitiateLimiter, validateRequest(initiateCallSchema), callController.initiateCall);
router.get('/history', callController.getCallHistory);
router.get('/:id', callController.getCallById);

export default router;