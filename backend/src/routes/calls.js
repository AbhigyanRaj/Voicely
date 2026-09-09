import express from 'express';
import * as callController from '../controllers/callController.js';
import { protect } from '../middleware/auth.js';
import { sandboxLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * Start a browser voice session.
 *
 * Auth is optional: guests get the demo agents, signed-in users can also select
 * their own. Rate limited separately from the general limiter because each
 * session costs real STT, LLM and TTS spend on the server's own keys.
 */
router.post('/browser-sandbox', sandboxLimiter, (req, res, next) => {
    if (req.headers.authorization) {
        return protect(req, res, next);
    }
    next();
}, callController.initiateBrowserSandboxCall);

router.use(protect);
router.get('/history', callController.getCallHistory);
router.get('/:id', callController.getCallById);

export default router;
