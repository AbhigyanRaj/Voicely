
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, './.env') });

const callSchema = new mongoose.Schema({
  selectedVoice: String,
  selectedLanguage: String,
  customerName: String,
  phoneNumber: String,
  status: String,
  createdAt: Date
}, { timestamps: true });

const Call = mongoose.model('Call', callSchema);

async function checkRecentCalls() {
  try {
    const uri = process.env.MONGODB_URI;
    console.log('Connecting to', uri);
    await mongoose.connect(uri);
    console.log('Connected!');

    const calls = await Call.find().sort({ createdAt: -1 }).limit(5);
    console.log('--- RECENT CALLS ---');
    calls.forEach(c => {
      console.log(`[${c.createdAt}] ${c.customerName} (${c.phoneNumber}) - Voice: ${c.selectedVoice}, Lang: ${c.selectedLanguage}, Status: ${c.status}`);
    });

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

checkRecentCalls();
