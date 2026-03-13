import express from 'express';
import { protect } from '../middleware/auth.js';
import { 
  getWorkspaces, 
  createWorkspace, 
  switchWorkspace, 
  getWorkspaceAnalytics 
} from '../controllers/workspaceController.js';

const router = express.Router();

// All routes are protected
router.use(protect);

router.get('/', getWorkspaces);
router.post('/', createWorkspace);
router.post('/switch', switchWorkspace);
router.get('/:workspaceId/analytics', getWorkspaceAnalytics);

export default router;
