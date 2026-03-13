import express from 'express';
import { getLeadTimeline } from '../services/leadService.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Get lead timeline for a specific phone number
 */
router.get('/timeline', async (req, res) => {
  try {
    const { phoneNumber, workspaceId } = req.query;
    
    if (!phoneNumber || !workspaceId) {
      return res.status(400).json({ error: 'Missing phoneNumber or workspaceId' });
    }

    const lead = await getLeadTimeline(phoneNumber, workspaceId);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json(lead);
  } catch (err) {
    logger.error('Error fetching lead timeline:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

export default router;
