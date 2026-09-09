import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 100,
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.success(`MongoDB Connected: ${conn.connection.host}`);
    // Surface later failures instead of silently degrading.
    mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', err));
    mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  } catch (error) {
    logger.error('Error connecting to MongoDB', error);
    // Rethrow. This used to be swallowed with "Running without database", so the
    // server booted and served traffic against a dead database -- every request
    // buffering for mongoose's 10s default and then failing.
    throw error;
  }
};

export default connectDB; 