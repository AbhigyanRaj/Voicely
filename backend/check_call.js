import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
dotenv.config();

const CallSchema = new mongoose.Schema({}, { strict: false, collection: 'calls' });
const Call = mongoose.model('Call', CallSchema);

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");
  
  const calls = await Call.find({ status: 'completed' }).sort({ createdAt: -1 }).limit(3).lean();
  
  calls.forEach((c) => {
     console.log('Call ID:', c._id.toString());
     console.log('Call Status:', c.status);
     console.log('Transcription string length:', c.transcription ? c.transcription.length : 'Missing');
     console.log('Transcription Preview:', c.transcription ? c.transcription.substring(0, 100).replace(/\n/g, '\\n') : 'N/A');
     console.log('---------------------');
  });
  
  process.exit(0);
}
check();
