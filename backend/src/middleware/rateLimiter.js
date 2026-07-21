import rateLimit from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const skipPaths = [
      '/api/health', 
      '/api/calls/voices/health', 
      '/api/calls/handle-call', 
      '/api/calls/status', 
      '/api/calls/handle-developer-call'
    ];
    return skipPaths.includes(req.path);
  }
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
