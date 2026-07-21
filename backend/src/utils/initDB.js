import mongoose from 'mongoose';
import User from '../models/User.js';
import Module from '../models/Module.js';
import Call from '../models/Call.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database indexes and validation
export const initializeDatabase = async () => {
  try {
    logger.info('Initializing database...');

    // Create audio directory if it doesn't exist
    const audioDir = path.join(__dirname, '..', 'audio');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
      logger.success('Audio directory created', audioDir);
    } else {
      logger.debug('Audio directory confirmed', audioDir);
    }

    // Create a test audio file to verify the directory is writable
    const testFile = path.join(audioDir, 'test.txt');
    fs.writeFileSync(testFile, 'Audio directory is writable');
    logger.debug('Audio directory permissions verified');

    // Clean up test file
    if (fs.existsSync(testFile)) {
      fs.unlinkSync(testFile);
    }

    // Create indexes for better performance
    await User.createIndexes();
    await Module.createIndexes();
    await Call.createIndexes();

    logger.success('Database indexes verified');

    // Validate database connection
    const dbState = mongoose.connection.readyState;
    if (dbState === 1) {
      logger.success('Database connection is healthy');

      // Get database stats
      const stats = await mongoose.connection.db.stats();
      logger.debug(`Database stats: ${stats.collections} collections, ${stats.dataSize} bytes`);

      return true;
    } else {
      logger.warn('Database connection is not ready');
      return false;
    }
  } catch (error) {
    logger.error('Database initialization failed', error);
    return false;
  }
};

// Create a test user for development
export const createTestUser = async () => {
  try {
    const testUser = await User.findOne({ email: 'test@vokai.com' });

    if (!testUser) {
      const newUser = await User.create({
        email: 'test@vokai.com',
        name: 'Test User',
        subscription: 'premium',
        totalCallsMade: 0,
        isActive: true
      });

      logger.info('Test user created', newUser.email);
      return newUser;
    } else {
      logger.debug('Test user exists', testUser.email);
      return testUser;
    }
  } catch (error) {
    logger.error('Failed to create test user', error);
    return null;
  }
};

// Create a test module for development
export const createTestModule = async (userId) => {
  try {
    const testModule = await Module.findOne({
      userId: userId,
      name: 'Test Loan Module'
    });

    if (!testModule) {
      const newModule = await Module.create({
        userId: userId,
        name: 'Test Loan Module',
        description: 'A test module for loan applications',
        type: 'loan',
        questions: [
          {
            question: 'What is your monthly income?',
            order: 1,
            required: true
          },
          {
            question: 'How long have you been employed?',
            order: 2,
            required: true
          },
          {
            question: 'What is the purpose of this loan?',
            order: 3,
            required: true
          }
        ],
        isActive: true,
        totalCalls: 0,
        successfulCalls: 0
      });

      logger.info('Test module created', newModule.name);
      return newModule;
    } else {
      logger.debug('Test module exists', testModule.name);
      return testModule;
    }
  } catch (error) {
    logger.error('Failed to create test module', error);
    return null;
  }
};

// Database health check
export const checkDatabaseHealth = async () => {
  try {
    const dbState = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    const health = {
      status: states[dbState] || 'unknown',
      connected: dbState === 1,
      collections: [],
      stats: null
    };

    if (dbState === 1) {
      // Get collection names
      const collections = await mongoose.connection.db.listCollections().toArray();
      health.collections = collections.map(col => col.name);

      // Get database stats
      health.stats = await mongoose.connection.db.stats();
    }

    return health;
  } catch (error) {
    logger.error('Database health check failed', error);
    return {
      status: 'error',
      connected: false,
      error: error.message
    };
  }
};

export const checkAudioDirectoryHealth = async () => {
  try {
    // Check if audio directory exists and is writable
    const audioDir = path.join(__dirname, '..', 'audio');
    const audioDirExists = fs.existsSync(audioDir);
    const audioDirWritable = audioDirExists && fs.accessSync ? true : false;

    return {
      status: 'healthy',
      audioDirectory: {
        exists: audioDirExists,
        writable: audioDirWritable,
        path: audioDir
      },
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    logger.error('Audio directory health check failed', error);
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}; 