import Lead from '../models/Lead.js';
import logger from '../utils/logger.js';
import { parseRelativeTime } from '../utils/timeUtils.js';

/**
 * Sync a call to a Lead journey
 */
export const syncCallToLead = async (call, deepAnalysis) => {
  try {
    const { phoneNumber, workspaceId, customerName, _id: callId } = call;
    
    if (!workspaceId) {
      logger.info('Skipping lead sync for anonymous/workspace-less call');
      return null;
    }
    
    // 1. Find or create lead
    let lead = await Lead.findOne({ phoneNumber, workspaceId });
    
    if (!lead) {
      logger.info(`Creating new Lead for ${phoneNumber} in workspace ${workspaceId}`);
      lead = new Lead({
        phoneNumber,
        workspaceId,
        customerName: customerName || 'Unknown Customer',
        callHistory: [callId]
      });
    } else {
      // Update existing lead
      if (!lead.callHistory.includes(callId)) {
        lead.callHistory.push(callId);
      }
      if (customerName && (!lead.customerName || lead.customerName === 'Unknown Customer')) {
        lead.customerName = customerName;
      }
      lead.lastInteraction = new Date();
    }

    // 2. Handle Follow-up Scheduling
    const followup = deepAnalysis?.followupInfo;
    if (followup?.shouldFollowUp && followup.scheduledTime) {
      const scheduledDate = parseRelativeTime(followup.scheduledTime);
      
      if (scheduledDate) {
        logger.success(`Scheduling auto-followup for Lead ${phoneNumber} at ${scheduledDate}`);
        lead.scheduledEvents.push({
          time: scheduledDate,
          type: 'automatic_call',
          status: 'pending',
          reason: followup.reason || 'AI scheduled follow-up'
        });
        lead.status = 'callback_scheduled';
      } else {
        logger.warn(`Failed to parse relative time: "${followup.scheduledTime}"`);
      }
    }

    await lead.save();
    return lead;
  } catch (err) {
    logger.error('Error in syncCallToLead:', err);
    throw err;
  }
};

/**
 * Get lead journey (timeline) for a phone number
 */
export const getLeadTimeline = async (phoneNumber, workspaceId) => {
  return await Lead.findOne({ phoneNumber, workspaceId })
    .populate({
      path: 'callHistory',
      select: 'status createdAt duration evaluation.result summary transcription',
      options: { sort: { createdAt: 1 } }
    });
};
