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
    enum: ['twilio'], // Extendable later
    default: 'twilio'
  },
  credentials: {
    accountSid: { type: String, required: true },
    authToken: { type: String, required: true }, // Will be encrypted
    phoneNumber: { type: String, required: true }
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
