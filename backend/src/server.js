import express from 'express';
import os from 'os';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import mongoose from 'mongoose';
import logger from './utils/logger.js';
import latencyMetrics from './utils/latencyMetrics.js';

// Load environment variables FIRST - with explicit path
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Validate environment variables
import { validateEnvironment } from './utils/envValidator.js';
if (!validateEnvironment()) {
  logger.error('CRITICAL: Server cannot start due to missing environment variables');
  process.exit(1);
}

// Import database and utilities
import connectDB from './config/database.js';
import { getDBStatus } from './utils/dbUtils.js';
import { initializeDatabase } from './utils/initDB.js';
import { initCache } from './utils/cacheUtils.js';

// Import routes
import authRoutes from './routes/auth.js';
import moduleRoutes from './routes/modules.js';
import callRoutes from './routes/calls.js';
import workspaceRoutes from './routes/workspaces.js';
import settingsRoutes from './routes/settings.js';
import developerRoutes from './routes/developer.js';
import apiRoutes from './routes/api.js';
import { setupMediaStreamWebSocket } from './controllers/mediaStreamController.js';
// Cartesia "Kendra": what the sandbox uses unless the agent names another voice.
const DEFAULT_SANDBOX_VOICE_ID = '79a125e8-cd45-4c13-8a67-188112f4dd22';
import { initializeLiveCallWebSocket, getLiveCallStateSize } from './websocket/liveCallServer.js';
import http from 'http';
import statsRoutes from './routes/stats.js';


const app = express();
app.use(compression());
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 10000;

// Debug: Check if environment variables are loaded

// Serve generated audio files statically with proper headers
app.use('/audio', (req, res, next) => {
  // Set CORS headers for audio files
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, ngrok-skip-browser-warning');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.header('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  next();
}, express.static(path.resolve('src/audio')));

// Serve sample-audio files statically with proper headers
app.use('/sample-audio', (req, res, next) => {
  // Set CORS headers for sample audio files
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, ngrok-skip-browser-warning');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  res.header('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  next();
}, express.static(path.resolve('sample-audio')));

// Security middleware with relaxed settings for audio
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false // Allow OAuth popups to communicate back
}));

// Correlation ID middleware
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.id);
  next();
});

// Request logging middleware using Pino
app.use(pinoHttp({
  logger: logger.pino,
  genReqId: function (req) { return req.id; },
  autoLogging: {
    ignore: (req) => {
      // Ignore static assets or frequent polling if needed
      return req.url.startsWith('/sample-audio') || req.url === '/api/v1/health';
    }
  }
}));

// CORS configuration - Allow all origins in development
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://voicelyy.vercel.app', 'https://voicely-api-qj5r.onrender.com', 'http://localhost:5173', 'https://withvoicely.in', 'https://www.withvoicely.in']
    : true, // Allow all origins in development
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'ngrok-skip-browser-warning', 'Accept'],
  exposedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Trust proxy for rate limiting (essential for ngrok and production proxies)
app.set('trust proxy', 1);

// Rate limiting
import { generalLimiter } from './middleware/rateLimiter.js';
app.use(generalLimiter);

// Connect to MongoDB and initialize
const startServer = async () => {
  try {
    // Start Database and Services
    logger.info('Initializing services...');
    await connectDB();
    // The return value used to be discarded, so an index-creation failure or an
    // unwritable audio directory booted a half-initialised server anyway.
    if (!(await initializeDatabase())) {
      throw new Error('Database initialization failed');
    }
    await initCache();

    // Log configuration status
    logger.info('Service Configuration:');
    logger.info(`STT (Deepgram): ${process.env.DEEPGRAM_API_KEY ? 'Enabled' : 'Disabled'}`);
    logger.info(`LLM (Groq): ${process.env.GROQ_API_KEY ? 'Enabled' : 'Disabled'}`);
    logger.info(`TTS (Cartesia): ${process.env.CARTESIA_API_KEY ? 'Enabled' : 'Disabled'}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);

    // Initialize WebSocket servers in noServer mode
    const mediaStreamWss = setupMediaStreamWebSocket();
    const liveCallWss = initializeLiveCallWebSocket();
    const developerStreamWss = (await import('./websocket/developerStreamServer.js')).setupDeveloperStreamWebSocket();

    // Handle manual WebSocket upgrade dispatching.
    //
    // Wrapped: this runs inside an 'upgrade' listener, so anything that throws
    // here -- a malformed request.url reaching new URL(), for instance -- is an
    // uncaught exception that takes down the process and every live session with
    // it.
    httpServer.on('upgrade', (request, socket, head) => {
      let pathname;
      try {
        pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
      } catch (err) {
        logger.warn(`Rejected WebSocket upgrade with unparseable URL: ${err.message}`);
        socket.destroy();
        return;
      }
      logger.info(`WebSocket Upgrade Request: [Path: ${pathname}] [Host: ${request.headers.host}]`);

      try {

      if (pathname === '/api/streams/browser') {
        mediaStreamWss.handleUpgrade(request, socket, head, (ws) => {
          mediaStreamWss.emit('connection', ws, request);
        });
      } else if (pathname === '/live-call') {
        liveCallWss.handleUpgrade(request, socket, head, (ws) => {
          liveCallWss.emit('connection', ws, request);
        });
      } else if (pathname === '/api/v1/stream') {
        developerStreamWss.handleUpgrade(request, socket, head, (ws) => {
          developerStreamWss.emit('connection', ws, request);
        });
      } else {
        logger.warn(`Rejected WebSocket upgrade for unknown path: ${pathname}`);
        socket.destroy();
      }
      } catch (err) {
        logger.error('WebSocket upgrade dispatch failed', err);
        socket.destroy();
      }
    });


    // Start the server
    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.success(`SERVER RUNNING ON PORT ${PORT} (0.0.0.0)`);
      logger.info(`Health Check: http://localhost:${PORT}/api/v1/health`);

      // Synthesize the demo agents' openers now, so the first visitor of a cold
      // process hears the greeting as instantly as the hundredth. After listen()
      // and unawaited: it must not hold the port, and a Cartesia outage here is
      // not a reason to fail to boot.
      import('./services/greetingCache.js')
        .then(m => m.prewarmGreetings({ voiceId: DEFAULT_SANDBOX_VOICE_ID }))
        .catch(err => logger.warn(`Greeting prewarm skipped: ${err.message}`));
    });

    // Graceful Shutdown Handler
    const gracefulShutdown = () => {
      logger.info('Received kill signal, shutting down gracefully.');
      httpServer.close(() => {
        logger.info('Closed out remaining connections.');
        mongoose.connection.close(false).then(() => {
          logger.info('MongoDb connection closed.');
          process.exit(0);
        });
      });

      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);

    // Last-resort safety net. Without these, one unhandled EventEmitter 'error'
    // -- a provider socket failing mid-session, say -- terminated the process and
    // dropped every other live session with it. Log and keep serving; a truly
    // corrupt process is better handled by the platform's health check.
    process.on('uncaughtException', (err) => {
      logger.error('UNCAUGHT EXCEPTION (server continuing)', err);
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('UNHANDLED REJECTION (server continuing)', reason);
    });

    // Nodemon restart handler
    process.once('SIGUSR2', () => {
      httpServer.close(() => {
        process.kill(process.pid, 'SIGUSR2');
      });
    });
  } catch (error) {
    logger.error('CRITICAL STARTUP ERROR', error);
    process.exit(1);
  }
};

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/modules', moduleRoutes);
app.use('/api/v1/calls', callRoutes);
app.use('/api/v1/workspaces', workspaceRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/developer', developerRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1', apiRoutes);

// Health check with detailed database info
app.get('/api/v1/health', async (req, res) => {
  // Liveness only. This used to return checkDatabaseHealth(), which includes
  // every collection name and db.stats() -- an unauthenticated inventory of the
  // database. The detail is still available to an operator via the logs.
  try {
    const connected = getDBStatus() === 'connected';
    res.status(connected ? 200 : 503).json({
      status: connected ? 'OK' : 'DEGRADED',
      database: connected ? 'connected' : getDBStatus(),
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({ status: 'ERROR', timestamp: new Date().toISOString() });
  }
});

// Latency and process metrics.
//
// `latency` holds p50/p90/p95/p99/p100 per stage of the voice pipeline. The
// headline number is `turn.mouth_to_ear`: the user stopped speaking, and the
// first audio of the reply reached the wire. Everything else decomposes it.
//
// Percentiles are computed over the most recent 1000 samples of each metric;
// `count` is the lifetime total, `window` is how many the percentiles used.
app.get('/api/v1/metrics', (req, res) => {
  // Latency stays public on purpose: it is the number the product claims, and a
  // claim you can verify is worth more than one you cannot. The process
  // fingerprint that used to sit here -- pid, rss, heap, loadavg, cpu count --
  // told an attacker about the host and nothing about the pipeline.
  res.json({
    uptime: Math.round(process.uptime()),
    latency: latencyMetrics.snapshotAll(),
    counters: latencyMetrics.counterSnapshot(),
    // Should return to zero between sessions; a climbing number is a leak.
    liveState: getLiveCallStateSize(),
  });
});


// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Global Error Handler caught an error', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start the server
startServer();