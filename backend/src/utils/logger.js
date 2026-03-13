/**
 * Professional Logging Utility
 * Supports levels: INFO, SUCCESS, WARN, ERROR, DEBUG
 * Color-coded for readability and structured with timestamps.
 */

const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
    bgRed: "\x1b[41m"
};

const levels = {
    INFO: { color: colors.cyan, prefix: "[INFO]", icon: "ℹ" },
    SUCCESS: { color: colors.green, prefix: "[SUCCESS]", icon: "✔" },
    WARN: { color: colors.yellow, prefix: "[WARN]", icon: "⚠" },
    ERROR: { color: colors.red, prefix: "[ERROR]", icon: "✖" },
    DEBUG: { color: colors.gray, prefix: "[DEBUG]", icon: "⚙" }
};

const getTimestamp = () => {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
};

const formatMessage = (level, message, ...args) => {
    const { color, prefix, icon } = levels[level];
    const timestamp = `${colors.dim}${getTimestamp()}${colors.reset}`;
    const label = `${color}${colors.bright}${prefix}${colors.reset}`;

    // Handling multiple arguments and objects
    const additional = args.length > 0 ? '\n' + args.map(arg => {
        if (arg instanceof Error) {
            return `${colors.red}${arg.stack}${colors.reset}`;
        }
        if (typeof arg === 'object') {
            return JSON.stringify(arg, null, 2);
        }
        return arg;
    }).join(' ') : '';

    return `${timestamp} ${label} ${message}${additional}`;
};

const logger = {
    info: (message, ...args) => {
        console.log(formatMessage('INFO', message, ...args));
    },

    success: (message, ...args) => {
        console.log(formatMessage('SUCCESS', message, ...args));
    },

    warn: (message, ...args) => {
        console.warn(formatMessage('WARN', message, ...args));
    },

    error: (message, ...args) => {
        console.error(formatMessage('ERROR', message, ...args));
    },

    debug: (message, ...args) => {
        if (process.env.NODE_ENV !== 'production') {
            console.log(formatMessage('DEBUG', message, ...args));
        }
    },

    // Specialized log for requests
    request: (req, res, duration) => {
        const status = res.statusCode;
        const color = status >= 500 ? colors.red : status >= 400 ? colors.yellow : colors.green;
        const method = `${colors.bright}${req.method}${colors.reset}`;
        const url = req.originalUrl || req.url;

        logger.info(`${method} ${url} ${color}${status}${colors.reset} - ${duration}ms`);
    }
};

export default logger;
