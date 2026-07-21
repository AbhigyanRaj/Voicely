import { z } from 'zod';
import logger from '../utils/logger.js';

export const validateRequest = (schema) => {
  return async (req, res, next) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        logger.warn(`Validation failed: ${JSON.stringify(errors)}`);
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors
        });
      }
      return next(error);
    }
  };
};
