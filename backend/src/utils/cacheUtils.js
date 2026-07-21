import { createClient } from 'redis';
import NodeCache from 'node-cache';
import logger from './logger.js';

// In-memory fallback cache (default TTL 5 minutes)
const memoryCache = new NodeCache({ stdTTL: 300 });
let redisClient = null;

// Initialize Cache (Redis if configured, otherwise Memory)
export const initCache = async () => {
  if (process.env.REDIS_URL) {
    try {
      redisClient = createClient({ url: process.env.REDIS_URL });
      redisClient.on('error', (err) => logger.error('Redis Client Error', err));
      await redisClient.connect();
      logger.info('Connected to Redis Cache');
    } catch (err) {
      logger.error('Failed to connect to Redis. Falling back to memory cache.', err);
      redisClient = null;
    }
  } else {
    logger.info('REDIS_URL not provided. Using in-memory cache fallback.');
  }
};

/**
 * Get item from cache
 * @param {string} key
 */
export const getCache = async (key) => {
  try {
    if (redisClient) {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } else {
      return memoryCache.get(key);
    }
  } catch (error) {
    logger.error(`Cache get error for ${key}:`, error);
    return null;
  }
};

/**
 * Set item in cache
 * @param {string} key
 * @param {any} value
 * @param {number} ttl - Time to live in seconds (default 300)
 */
export const setCache = async (key, value, ttl = 300) => {
  try {
    if (redisClient) {
      await redisClient.set(key, JSON.stringify(value), { EX: ttl });
    } else {
      memoryCache.set(key, value, ttl);
    }
  } catch (error) {
    logger.error(`Cache set error for ${key}:`, error);
  }
};

/**
 * Delete item from cache
 * @param {string} key
 */
export const delCache = async (key) => {
  try {
    if (redisClient) {
      await redisClient.del(key);
    } else {
      memoryCache.del(key);
    }
  } catch (error) {
    logger.error(`Cache delete error for ${key}:`, error);
  }
};

export default { initCache, getCache, setCache, delCache };
