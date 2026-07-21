import pino from 'pino';

// Use pino-pretty in development, raw JSON in production
const isDev = process.env.NODE_ENV !== 'production';

const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  } : undefined,
});

// Wrapper to maintain backward compatibility with our custom logger methods
const logger = {
  info: (msg, ...args) => {
    if (args.length) pinoLogger.info({ args }, msg);
    else pinoLogger.info(msg);
  },
  success: (msg, ...args) => {
    if (args.length) pinoLogger.info({ args, type: 'success' }, msg);
    else pinoLogger.info({ type: 'success' }, msg);
  },
  warn: (msg, ...args) => {
    if (args.length) pinoLogger.warn({ args }, msg);
    else pinoLogger.warn(msg);
  },
  error: (msg, ...args) => {
    if (args.length) pinoLogger.error({ args }, msg);
    else pinoLogger.error(msg);
  },
  debug: (msg, ...args) => {
    if (args.length) pinoLogger.debug({ args }, msg);
    else pinoLogger.debug(msg);
  },
  // Export the raw pino instance for advanced uses like express-pino-logger
  pino: pinoLogger,
};

export default logger;
