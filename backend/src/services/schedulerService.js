import Lead from '../models/Lead.js';
import * as callService from './callService.js';
import logger from '../utils/logger.js';
import cron from 'node-cron';

let schedulerTask = null;

/**
 * Initialize the call scheduler
 */
export const initScheduler = () => {
  if (schedulerTask) return;

  logger.info('Call Scheduler initialized (Running every 30 seconds via cron)');
  
  // Runs every 30 seconds
  schedulerTask = cron.schedule('*/30 * * * * *', async () => {
    try {
      await processDueCalls();
    } catch (err) {
      logger.error('Error in processDueCalls check:', err);
    }
  });
};

/**
 * Process all calls that are due for triggering
 */
const processDueCalls = async () => {
  const now = new Date();
  
  // Find leads with pending automatic calls that are due
  const leadsWithDueCalls = await Lead.find({
    "scheduledEvents.status": "pending",
    "scheduledEvents.type": "automatic_call",
    "scheduledEvents.time": { $lte: now }
  });

  if (leadsWithDueCalls.length === 0) return;

  logger.info(`Found ${leadsWithDueCalls.length} leads with due calls. Processing...`);

  for (const lead of leadsWithDueCalls) {
    // Process each due event for this lead
    for (const event of lead.scheduledEvents) {
      if (event.status === 'pending' && event.type === 'automatic_call' && event.time <= now) {
        try {
          await triggerScheduledCall(lead, event);
          event.status = 'completed';
        } catch (err) {
          logger.error(`Failed to trigger scheduled call for ${lead.phoneNumber}:`, err);
          // Retry logic could be added here
          event.status = 'pending'; // Keep it pending for next cycle
          event.metadata = { lastError: err.message, retryCount: (event.metadata?.retryCount || 0) + 1 };
          
          if (event.metadata.retryCount >= 3) {
            event.status = 'cancelled';
            logger.error(`Max retries reached for scheduled call to ${lead.phoneNumber}. Cancelling.`);
          } else {
            // Exponential backoff: retry in (retryCount * 5) minutes
            const backoffMinutes = event.metadata.retryCount * 5;
            event.time = new Date(Date.now() + backoffMinutes * 60000);
            logger.info(`Scheduled call for ${lead.phoneNumber} failed. Retrying in ${backoffMinutes} minutes.`);
          }
        }
      }
    }
    
    // Update lead status if no more pending calls
    const pendingCalls = lead.scheduledEvents.filter(e => e.status === 'pending');
    if (pendingCalls.length === 0) {
      lead.status = 'active';
    }

    await lead.save();
  }
};

/**
 * Trigger an actual outbound call for a lead
 */
const triggerScheduledCall = async (lead, event) => {
  logger.info(`TRIGGERING AUTO-CALL for ${lead.phoneNumber} (Reason: ${event.reason})`);

  // We need to find the last call for context
  // Alternatively, we can use the callHistory from lead
  const lastCallId = lead.callHistory[lead.callHistory.length - 1];
  const lastCall = await import('../models/Call.js').then(m => m.default.findById(lastCallId));

  if (!lastCall) {
    throw new Error('Last call record not found for context injection');
  }

  // Inject context into the module's system prompt or passed directly
  const module = await import('../models/Module.js').then(m => m.default.findById(lastCall.moduleId));
  if (!module) throw new Error('Module not found for scheduled call');

  // Prepare call parameters
  const callParams = {
    phoneNumber: lead.phoneNumber,
    customerName: lead.customerName,
    moduleId: lastCall.moduleId,
    workspaceId: lead.workspaceId,
    userId: lastCall.userId,
    selectedVoice: lastCall.selectedVoice,
    selectedLanguage: lastCall.selectedLanguage,
    ttsProvider: lastCall.ttsProvider,
    source: 'automatic_scheduler',
    priorContext: lastCall.transcription || lastCall.summary || ''
  };

  // Perform the call
  const twilioCall = await callService.initiateCall(callParams);
  
  // CRITICAL: Create Call record in DB so MediaStream can find it
  const Call = await import('../models/Call.js').then(m => m.default);
  await Call.create({
    userId: lastCall.userId,
    workspaceId: lead.workspaceId,
    moduleId: lastCall.moduleId,
    customerName: lead.customerName,
    phoneNumber: lead.phoneNumber,
    twilioCallSid: twilioCall.sid,
    selectedVoice: lastCall.selectedVoice,
    selectedLanguage: lastCall.selectedLanguage,
    ttsProvider: lastCall.ttsProvider,
    status: 'initiated',
    source: 'automatic_scheduler',
    priorContext: callParams.priorContext
  });
  
  logger.success(`Scheduled call initiated and record created for ${lead.phoneNumber}`);
};
