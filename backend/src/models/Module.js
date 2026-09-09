import mongoose from 'mongoose';

const moduleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  systemPrompt: {
    type: String,
    default: '',
  },
  type: {
    type: String,
    enum: ['loan', 'credit_card', 'custom'],
    required: true,
  },
  // Cartesia is the only provider. Kept as a field so existing rows load and so
  // a second provider can be added without a migration.
  ttsProvider: {
    type: String,
    enum: ['cartesia'],
    default: 'cartesia',
  },
  selectedLanguage: {
    type: String,
    default: 'en-US'
  },
  // Must be a Cartesia voice UUID: it is passed straight through as one. The
  // previous default, 'NEERJA', was a Google voice name, so any row that kept
  // the default was rejected by Cartesia and played no audio for the whole
  // session -- silently, because TTS errors are logged rather than surfaced.
  selectedVoice: {
    type: String,
    default: '79a125e8-cd45-4c13-8a67-188112f4dd22'
  },
  questions: [{
    question: {
      type: String,
      required: true,
    },
    order: {
      type: Number,
      required: true,
    },
    required: {
      type: Boolean,
      default: true,
    },
  }],
  isActive: {
    type: Boolean,
    default: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  totalCalls: {
    type: Number,
    default: 0,
  },
  successfulCalls: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
});

moduleSchema.index({ userId: 1, workspaceId: 1, isDeleted: 1 });

const Module = mongoose.model('Module', moduleSchema);

export default Module; 