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
import { initializeDatabase, checkDatabaseHealth, checkAudioDirectoryHealth } from './utils/initDB.js';
import { initializeSharedAudioLibrary } from './services/audioCache.js';
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
import { initializeLiveCallWebSocket } from './websocket/liveCallServer.js';
import { initScheduler } from './services/schedulerService.js';
import http from 'http';
import statsRoutes from './routes/stats.js';
import leadsRoutes from './routes/leads.js';


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
    ? ['https://voicelyy.vercel.app', 'https://voicely-api-kbwf.onrender.com', 'http://localhost:5173', 'https://withvoicely.in', 'https://www.withvoicely.in']
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
    await initializeDatabase();
    await initCache();

    // Log configuration status
    logger.info('Service Configuration:');
    logger.info(`Google TTS: ${process.env.GOOGLE_TTS_API_KEY ? 'Enabled' : 'Disabled'}`);
    logger.info(`ElevenLabs: ${process.env.ELEVENLABS_API_KEY ? 'Enabled' : 'Disabled'}`);
    logger.info(`Environment: ${process.env.NODE_ENV}`);

    // Initialize shared audio library (only if ElevenLabs API key is set)
    // This will check cache first, so it won't regenerate existing audio
    if (process.env.ELEVENLABS_API_KEY) {
      logger.info('Initializing shared audio library...');
      try {
        await initializeSharedAudioLibrary('RACHEL'); // Assuming seedAudioLibrary was a typo in the instruction and initializeSharedAudioLibrary is the correct function.
        logger.success('Shared audio library ready');
      } catch (error) {
        logger.error('Failed to initialize shared audio library', error);
      }
    } else {
      logger.warn('ELEVENLABS_API_KEY not set - skipping audio library initialization');
    }

    // Initialize WebSocket servers in noServer mode
    const mediaStreamWss = setupMediaStreamWebSocket();
    const liveCallWss = initializeLiveCallWebSocket();
    const developerStreamWss = (await import('./websocket/developerStreamServer.js')).setupDeveloperStreamWebSocket();

    // Handle manual WebSocket upgrade dispatching
    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const pathname = url.pathname;
      logger.info(`WebSocket Upgrade Request: [Path: ${pathname}] [Host: ${request.headers.host}]`);

      if (pathname === '/api/streams/twilio' || pathname === '/api/streams/browser') {
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
    });


    // Initialize Intelligent Call Scheduler
    initScheduler();

    // Start the server
    httpServer.listen(PORT, '0.0.0.0', () => {
      logger.success(`SERVER RUNNING ON PORT ${PORT} (0.0.0.0)`);
      logger.info(`Health Check: http://localhost:${PORT}/api/v1/health`);
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
app.use('/api/v1/leads', leadsRoutes);

// Health check with detailed database info
app.get('/api/v1/health', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    const audioHealth = await checkAudioDirectoryHealth();

    res.json({
      status: 'OK',
      message: 'Voicely API is running',
      database: dbHealth,
      audio: audioHealth,
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        load: os.loadavg()
      },
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Latency Metrics Endpoint (7.4)
app.get('/api/v1/metrics', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: {
      rss: process.memoryUsage().rss,
      heapTotal: process.memoryUsage().heapTotal,
      heapUsed: process.memoryUsage().heapUsed,
    },
    cpu: {
      loadAvg: os.loadavg(),
      cpus: os.cpus().length
    },
    pid: process.pid
  });
});

// Database status endpoint
app.get('/api/db/status', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    res.json(dbHealth);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get database status',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Global Error Handler caught an error', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start the server
startServer();