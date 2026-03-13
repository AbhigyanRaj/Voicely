import mongoose from 'mongoose';

const workspaceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: String,
    enum: ['real_estate', 'medical', 'startup', 'ecommerce'],
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});

const Workspace = mongoose.model('Workspace', workspaceSchema);

export default Workspace;
