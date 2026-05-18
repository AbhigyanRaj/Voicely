import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const CallSchema = new mongoose.Schema({}, { strict: false });
const Call = mongoose.model('Call', CallSchema);

async function run() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected! Fetching the latest call record...');

    const latestCall = await Call.findOne().sort({ createdAt: -1 });

    if (!latestCall) {
      console.log('No call records found in MongoDB.');
      return;
    }

    console.log('\n================ LATEST CALL RAW RECORD ================');
    console.log(JSON.stringify(latestCall.toObject(), null, 2));
    console.log('====================================================\n');

  } catch (error) {
    console.error('Error fetching latest call:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

run();
