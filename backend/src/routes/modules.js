import express from 'express';
import * as moduleController from '../controllers/moduleController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

router.get('/', moduleController.getModules);
router.post('/', moduleController.createModule);
router.get('/:id', moduleController.getModuleById);
router.put('/:id', moduleController.updateModule);
router.delete('/:id', moduleController.deleteModule);

export default router;