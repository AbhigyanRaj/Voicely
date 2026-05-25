import mongoose from 'mongoose';

const siteStatSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
    default: 'global_stats'
  },
  visitorCount: {
    type: Number,
    default: 50
  },
  visitedClients: {
    type: [String],
    default: []
  }
}, { timestamps: true });

export default mongoose.model('SiteStat', siteStatSchema);
