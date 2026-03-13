import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Import routes
import authRoutes from './routes/auth.js';
import moduleRoutes from './routes/modules.js';
import callRoutes from './routes/calls.js';
import workspaceRoutes from './routes/workspaces.js';
import { setupMediaStreamWebSocket } from './routes/mediaStream.js';
import { initializeLiveCallWebSocket } from './websocket/liveCallServer.js';
import { initTelegramBot } from './services/botService.js';
import { initScheduler } from './services/schedulerService.js';
import logger from './utils/logger.js';
import http from 'http';


const app = express();
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

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.request(req, res, duration);
  });
  next();
});

// CORS configuration - Allow all origins in development
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? ['https://voicelyy.vercel.app', 'https://voicely-api-kbwf.onrender.com', 'http://localhost:5173']
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
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Skip rate limiting for health checks
  skip: (req) => req.path === '/api/health' || req.path === '/api/calls/voices/health'
});
app.use(limiter);

// Connect to MongoDB and initialize
const startServer = async () => {
  try {
    // Start Database and Services
    logger.info('Initializing services...');
    await connectDB();
    await initializeDatabase();

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

    // Handle manual WebSocket upgrade dispatching
    httpServer.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const pathname = url.pathname;
      logger.info(`WebSocket Upgrade Request: [Path: ${pathname}] [Host: ${request.headers.host}]`);

      if (pathname === '/api/streams/twilio') {
        mediaStreamWss.handleUpgrade(request, socket, head, (ws) => {
          mediaStreamWss.emit('connection', ws, request);
        });
      } else if (pathname === '/live-call') {
        liveCallWss.handleUpgrade(request, socket, head, (ws) => {
          liveCallWss.emit('connection', ws, request);
        });
      } else {
        logger.warn(`Rejected WebSocket upgrade for unknown path: ${pathname}`);
        socket.destroy();
      }
    });

    // Initialize Telegram Bot
    initTelegramBot();

    // Initialize Intelligent Call Scheduler
    initScheduler();

    // Start the server
    httpServer.listen(PORT, () => {
      logger.success(`SERVER RUNNING ON PORT ${PORT}`);
      logger.info(`Health Check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    logger.error('CRITICAL STARTUP ERROR', error);
    process.exit(1);
  }
};

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/leads', (await import('./routes/leads.js')).default);

// Health check with detailed database info
app.get('/api/health', async (req, res) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    const audioHealth = await checkAudioDirectoryHealth();

    res.json({
      status: 'OK',
      message: 'Vok.AI API is running',
      database: dbHealth,
      audio: audioHealth,
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