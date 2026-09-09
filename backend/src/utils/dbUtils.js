import mongoose from 'mongoose';

// Check if database is connected
export const isDBConnected = () => {
  return mongoose.connection.readyState === 1;
};

// Get database status
export const getDBStatus = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  return states[mongoose.connection.readyState] || 'unknown';
};
