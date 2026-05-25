import express from 'express';
import logger from '../utils/logger.js';

const router = express.Router();

// The REST API for /v1/call has been deprecated in favor of the S2S WebSocket endpoint
// WebSocket Endpoint: wss://api.voicely.app/v1/stream

export default router;
