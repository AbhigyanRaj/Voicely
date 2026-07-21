import express from 'express';
import SiteStat from '../models/SiteStat.js';
import logger from '../utils/logger.js';

const router = express.Router();

router.post('/visitors', async (req, res) => {
    try {
        const { clientId } = req.body;
        
        let stat = await SiteStat.findById('global_stats');
        if (!stat) {
            stat = await SiteStat.create({ _id: 'global_stats', visitorCount: 101, visitedClients: [] });
        }

        if (clientId && !stat.visitedClients.includes(clientId)) {
            stat.visitorCount += 1;
            stat.visitedClients.push(clientId);
            await stat.save();
        }

        res.json({ success: true, count: stat.visitorCount });
    } catch (error) {
        logger.error('Error tracking visitor:', error);
        res.status(500).json({ error: 'Failed to update visitor count' });
    }
});

export default router;
