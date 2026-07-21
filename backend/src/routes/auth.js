import express from 'express';
import * as authController from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validator.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { registerSchema, loginSchema } from '../validators/authValidator.js';

const router = express.Router();

// Public routes
router.post('/google', authLimiter, authController.googleAuth);
router.post('/register', authLimiter, validateRequest(registerSchema), authController.emailRegister);
router.post('/login', authLimiter, validateRequest(loginSchema), authController.emailLogin);

// Protected routes
router.use(protect);
router.get('/me', authController.getProfile);
router.put('/profile', authController.updateProfile);
router.get('/analytics', authController.getAnalytics);
router.get('/dashboard', authController.getDashboard);

export default router;