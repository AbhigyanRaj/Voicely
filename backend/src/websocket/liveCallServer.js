import { WebSocketServer } from 'ws';
import logger from '../utils/logger.js';

// Store active WebSocket connections per call
const liveCallClients = new Map(); // callId -> Set of WebSocket clients
// Store call state (history, status) for late-joiners
const callStates = new Map(); // callId -> { history: [], status: string, metadata: {} }

/**
 * Initialize WebSocket server for live call monitoring
 * This runs alongside the existing Media Stream WebSocket without interference
 */
let liveCallWss = null;

export function initializeLiveCallWebSocket(server = null) {
  if (liveCallWss) return liveCallWss;

  liveCallWss = new WebSocketServer({
    noServer: true
  });

  liveCallWss.on('connection', (ws, req) => {
    // Extract callId from URL path: /live-call?callId=xxx
    const url = new URL(req.url, `http://${req.headers.host}`);
    const callId = url.searchParams.get('callId');

    if (!callId) {
      logger.warn('LiveCall WS connection rejected: No callId provided');
      ws.close(1008, 'Call ID required');
      return;
    }

    logger.debug(`LiveCall WS client connected for call: ${callId}`);

    // Add client to the call's client set
    if (!liveCallClients.has(callId)) {
      liveCallClients.set(callId, new Set());
    }
    liveCallClients.get(callId).add(ws);

    // Send initial connection confirmation and history
    const callState = callStates.get(callId) || { history: [], status: 'connecting' };
    
    ws.send(JSON.stringify({
      type: 'connection_established',
      callId: callId,
      status: callState.status,
      history: callState.history,
      timestamp: new Date().toISOString(),
      message: 'Connected to live call transcript'
    }));

    // Handle incoming messages from the client (e.g., Manual Intervention)
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'manual_intervention') {
          const { text } = message;
          logger.info(`Received manual intervention for call ${callId}: "${text}"`);
          
          // Import mediaStream dynamically to avoid circular dependencies
          const { handleManualIntervention } = await import('../routes/mediaStream.js');
          await handleManualIntervention(callId, text);
          
          // Acknowledge intervention
          ws.send(JSON.stringify({
            type: 'intervention_acknowledged',
            timestamp: new Date().toISOString(),
            text: text
          }));
        }
      } catch (err) {
        logger.error(`Error handling LiveCall message for call ${callId}:`, err);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      logger.debug(`LiveCall WS client disconnected for call: ${callId}`);
      const clients = liveCallClients.get(callId);
      if (clients) {
        clients.delete(ws);
        if (clients.size === 0) {
          liveCallClients.delete(callId);
          logger.debug(`Cleaned up empty LiveCall client set for call: ${callId}`);
        }
      }
    });

    // Handle client errors
    ws.on('error', (error) => {
      logger.error(`LiveCall WS error for call ${callId}`, error);
      const clients = liveCallClients.get(callId);
      if (clients) {
        clients.delete(ws);
      }
    });

    // Send ping to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000); // Ping every 30 seconds
  });

  logger.success('Live Call WebSocket server initialized (Manual Dispatch Mode)');
  return liveCallWss;
}

/**
 * Broadcast transcript update to all clients watching a specific call
 * This is called from the call routes when transcript updates occur
 */
export function broadcastTranscriptUpdate(callId, data) {
  const clients = liveCallClients.get(callId);
  
  // Update call state history (DO THIS BEFORE CLIENT CHECK)
  if (!callStates.has(callId)) {
    callStates.set(callId, { history: [], status: 'active', metadata: {} });
  }
  
  const callState = callStates.get(callId);
  
  if (data.isFinal) {
    // Check if this final message is already in history (prevent double-pushing from race conditions)
    const isDuplicate = callState.history.some(h => 
      h.text === data.text && 
      h.speaker === (data.source === 'ai' ? 'AI' : 'User') &&
      Math.abs(new Date(h.timestamp) - new Date()) < 2000 // Within 2 seconds
    );

    if (!isDuplicate) {
      callState.history.push({
        speaker: data.source === 'ai' ? 'AI' : 'User',
        text: data.text,
        timestamp: new Date().toISOString(),
        type: data.type || (data.source === 'ai' ? 'question' : 'response')
      });
      logger.debug(`Added final transcript to history for call ${callId}`);
    }
  }

  if (!clients || clients.size === 0) {
    // No clients watching this call - skip broadcast
    return;
  }

  const message = JSON.stringify({
    type: 'transcript_update',
    callId: callId,
    timestamp: new Date().toISOString(),
    ...data
  });

  let activeClients = 0;
  clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      try {
        client.send(message);
        activeClients++;
      } catch (error) {
        logger.error(`Failed to send LiveCall update for call ${callId}`, error);
        clients.delete(client);
      }
    } else {
      // Remove dead connections
      clients.delete(client);
    }
  });

  if (activeClients > 0) {
    logger.debug(`Broadcasted transcript update to ${activeClients} clients for call: ${callId}`);
  }
}

/**
 * Broadcast call status update (started, completed, failed)
 */
export function broadcastCallStatus(callId, status, metadata = {}) {
  const clients = liveCallClients.get(callId);
  if (!clients || clients.size === 0) {
    return;
  }

  // Update call state status
  if (!callStates.has(callId)) {
    callStates.set(callId, { history: [], status: status, metadata: metadata });
  } else {
    callStates.get(callId).status = status;
    callStates.get(callId).metadata = { ...callStates.get(callId).metadata, ...metadata };
  }

  const message = JSON.stringify({
    type: 'call_status',
    callId: callId,
    status: status,
    timestamp: new Date().toISOString(),
    ...metadata
  });

  clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        logger.error(`Failed to send status update to LiveCall client [${callId}]`, error);
        clients.delete(client);
      }
    }
  });

  logger.debug(`Broadcasted status '${status}' to ${clients.size} clients for call: ${callId}`);
}

/**
 * Clean up all clients for a completed call
 */
export function cleanupCallClients(callId) {
  const clients = liveCallClients.get(callId);
  if (clients) {
    // Send final message before cleanup
    const finalMessage = JSON.stringify({
      type: 'call_completed',
      callId: callId,
      timestamp: new Date().toISOString(),
      message: 'Call has ended. Transcript is now stored.'
    });

    clients.forEach(client => {
      if (client.readyState === client.OPEN) {
        try {
          client.send(finalMessage);
          client.close(1000, 'Call completed');
        } catch (error) {
          logger.error(`Error during LiveCall cleanup for call ${callId}`, error);
        }
      }
    });

    liveCallClients.delete(callId);
    callStates.delete(callId); // Clean up state as well
    logger.info(`Cleaned up all LiveCall clients and state for completed call: ${callId}`);
  }
}

/**
 * Get statistics about active connections
 */
export function getLiveCallStats() {
  const totalCalls = liveCallClients.size;
  let totalClients = 0;

  liveCallClients.forEach(clients => {
    totalClients += clients.size;
  });

  return {
    activeCalls: totalCalls,
    totalClients: totalClients,
    callsWithClients: Array.from(liveCallClients.keys())
  };
}
