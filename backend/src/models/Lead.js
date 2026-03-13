import mongoose from 'mongoose';

const LeadSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    index: true
  },
  customerName: {
    type: String,
    trim: true
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'converted', 'lost', 'callback_scheduled'],
    default: 'active'
  },
  callHistory: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Call'
  }],
  scheduledEvents: [{
    time: {
      type: Date,
      required: true
    },
    type: {
      type: String,
      enum: ['automatic_call', 'manual_reminder'],
      default: 'automatic_call'
    },
    status: {
      type: String,
      enum: ['pending', 'triggered', 'cancelled', 'completed'],
      default: 'pending'
    },
    reason: String,
    metadata: mongoose.Schema.Types.Mixed
  }],
  tags: [String],
  notes: String,
  lastInteraction: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure unique combination of phone number and workspace
LeadSchema.index({ phoneNumber: 1, workspaceId: 1 }, { unique: true });

const Lead = mongoose.model('Lead', LeadSchema);

export default Lead;
