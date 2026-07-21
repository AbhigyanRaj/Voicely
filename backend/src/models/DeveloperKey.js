import mongoose from 'mongoose';

const developerKeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  keyHash: {
    type: String,
    required: true,
  },
  keyPrefix: {
    type: String, // E.g., 'vk_dev_xxxx' to show the user a preview
    required: true,
  },
  name: {
    type: String,
    default: 'Default Pipeline Key'
  },
  pipelineConfig: {
    sttModel: { type: String, required: true },
    llmModel: { type: String, required: true },
    ttsModel: { type: String, required: true },
  },
  providerCredentials: {
    type: Map,
    of: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  lastUsedAt: {
    type: Date,
  }
});

developerKeySchema.index({ userId: 1 });

const DeveloperKey = mongoose.model('DeveloperKey', developerKeySchema);

export default DeveloperKey;
