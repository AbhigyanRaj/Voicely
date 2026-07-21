import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  // Optional: only set for email/password users
  password: {
    type: String,
    select: false, // Never returned in queries by default
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  totalCallsMade: {
    type: Number,
    default: 0,
  },
  subscription: {
    tier: {
      type: String,
      enum: ['free', 'pro', 'enterprise'],
      default: 'free',
    },
    status: {
      type: String,
      enum: ['active', 'canceled', 'expired'],
      default: 'active',
    },
    startDate: Date,
    endDate: Date,
  },
  dailyUsage: {
    date: String,
    callsMade: {
      type: Number,
      default: 0,
    },
    lastResetAt: Date,
  },

  currentWorkspace: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
  },
}, {
  timestamps: true,
  collection: 'voicely_users'
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Static method to find user by email
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

const User = mongoose.model('User', userSchema);

export default User; 