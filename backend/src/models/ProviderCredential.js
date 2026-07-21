import mongoose from 'mongoose';

const providerCredentialSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  providerName: {
    type: String,
    required: true,
    enum: ['twilio', 'deepgram', 'gemini', 'cartesia', 'sarvam', 'google'],
    default: 'twilio'
  },
  credentials: {
    accountSid: { type: String, required: false }, // required for Twilio
    authToken: { type: String, required: true }, // Encrypted API key/Auth Token
    phoneNumber: { type: String, required: false } // Only for Twilio
  },
  isDefault: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'provider_credentials'
});

// Ensure a user has only one default provider credential per providerName
providerCredentialSchema.index({ userId: 1, providerName: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

const ProviderCredential = mongoose.model('ProviderCredential', providerCredentialSchema);

export default ProviderCredential;
