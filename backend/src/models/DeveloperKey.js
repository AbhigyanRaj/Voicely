import mongoose from 'mongoose';

const developerKeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // `select: false` so it never leaves the server by accident. This is a direct
  // verifier for the key -- GET /developer/keys was returning it to the browser.
  keyHash: {
    type: String,
    required: true,
    select: false,
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
  // Encrypted third-party credentials. Also `select: false`: the ciphertext and
  // its IV were being shipped to the browser alongside the hash.
  providerCredentials: {
    type: Map,
    of: String,
    select: false
  },
  lastUsedAt: {
    type: Date,
  }
}, { timestamps: true });

developerKeySchema.index({ userId: 1 });
// The authentication lookup is by keyHash, not userId, so without this every
// connection was a full collection scan. Unique because two documents sharing a
// hash would make authentication ambiguous.
developerKeySchema.index({ keyHash: 1 }, { unique: true });

const DeveloperKey = mongoose.model('DeveloperKey', developerKeySchema);

export default DeveloperKey;
