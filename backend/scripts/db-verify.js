import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function test() {
    console.log('🔗 Attempting to connect to:', process.env.MONGODB_URI.split('@')[1] || 'localhost');
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        process.exit(1);
    }
}

test();
