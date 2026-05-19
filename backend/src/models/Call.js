import mongoose from 'mongoose';

const callSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
  },
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Module',
  },
  demoAgentId: {
    type: String,
    default: null,
  },
  customerName: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  twilioCallSid: {
    type: String,
    required: true,
    unique: true,
  },
  status: {
    type: String,
    enum: ['initiated', 'queued', 'ringing', 'in-progress', 'answered', 'completed', 'failed', 'busy', 'no-answer', 'canceled'],
    default: 'initiated',
  },
  duration: {
    type: Number,
    default: 0,
  },
  responses: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  transcription: {
    type: String,
    default: '',
  },
  summary: {
    type: String,
    default: '',
  },
  evaluation: {
    result: {
      type: String,
      enum: ['YES', 'NO', 'MAYBE', 'INVESTIGATION_REQUIRED', 'DECLINED', 'INTERESTED', 'QUALIFIED', 'UNQUALIFIED', 'NURTURE', 'URGENT', 'BOOKED'],
      default: null,
    },
    comments: [{
      type: String,
    }],
    analysis: {
      sentiment: { type: String, enum: ['Enthusiastic', 'Hesitant', 'Annoyed', 'Confused', 'Neutral'], default: 'Neutral' },
      objections: [{ type: String }],
      intentTier: { type: String, enum: ['High', 'Medium', 'Low'], default: 'Medium' },
      extractedData: { type: mongoose.Schema.Types.Mixed, default: {} },
      competitorMentioned: { type: Boolean, default: false },
    },
    stageAnalysis: {
      totalQuestions: { type: Number, default: 0 },
      questionsReached: { type: Number, default: 0 },
      dropOffPoint: { type: String, default: null },
    },
    metadata: {
      latency: { type: Number, default: 0 },
      providerCost: { type: Number, default: 0 },
    },
  },
  recordingUrl: {
    type: String,
    default: '',
  },
  selectedVoice: {
    type: String,
    default: 'NEERJA',
  },
  selectedLanguage: {
    type: String,
    default: 'en-IN',
  },
  ttsProvider: {
    type: String,
    enum: ['google', 'sarvam'],
    default: 'google',
  },
  currentStep: {
    type: Number,
    default: 0,
  },
  source: {
    type: String,
    enum: ['web', 'telegram', 'automatic_scheduler'],
    default: 'web',
  },
  priorContext: {
    type: String,
    default: '',
  },
}, {
  timestamps: true,
});

const Call = mongoose.model('Call', callSchema);

export default Call; 