import express from 'express';
import * as authController from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/google', authController.googleAuth);
router.post('/register', authController.emailRegister);
router.post('/login', authController.emailLogin);

// Protected routes
router.use(protect);
router.get('/me', authController.getProfile);
router.put('/profile', authController.updateProfile);
router.post('/buy-tokens', authController.buyTokens);
router.get('/analytics', authController.getAnalytics);
router.get('/dashboard', authController.getDashboard);
router.post('/telegram/link-code', authController.generateTelegramCode);

export default router;