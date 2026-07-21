import express from 'express';
import * as moduleController from '../controllers/moduleController.js';
import { protect } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validator.js';
import { createModuleSchema } from '../validators/moduleValidator.js';

const router = express.Router();

router.use(protect);

router.get('/', moduleController.getModules);
router.post('/', validateRequest(createModuleSchema), moduleController.createModule);
router.get('/:id', moduleController.getModuleById);
router.put('/:id', moduleController.updateModule);
router.delete('/:id', moduleController.deleteModule);

export default router;