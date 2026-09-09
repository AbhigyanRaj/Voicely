import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // These were all written without the /v1 segment, so not one of them could
    // ever match req.path -- the health check the frontend polls and the Twilio
    // webhooks were all being rate limited.
    const skipPaths = [
      '/api/v1/health',
      '/api/v1/metrics',
      '/api/v1/calls/handle-call',
      '/api/v1/calls/status',
      '/api/v1/calls/handle-developer-call'
    ];
    return skipPaths.includes(req.path);
  }
});

/**
 * The browser sandbox is unauthenticated and each session costs real STT, LLM
 * and TTS spend on our own keys, so it needs its own ceiling. Previously only
 * the 100-per-15-minutes general limiter applied, while the *authenticated*
 * /calls/initiate got a much tighter 5 per minute.
 */
export const sandboxLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sandbox sessions started. Please wait a minute.' }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

export const callInitiateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many calls initiated from this IP, please try again after a minute' }
});
