import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../src/models/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function generate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const user = await User.findOne();
        if (!user) {
            console.log('❌ No users found in database');
            process.exit(1);
        }

        const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += characters.charAt(Math.floor(Math.random() * characters.length));
        }

        user.telegram = {
            ...user.telegram,
            linkingCode: {
                code,
                expiresAt: new Date(Date.now() + 30 * 60 * 1000)
            }
        };

        if (!user.name) user.name = 'Test User';

        await user.save();
        console.log(`✅ Code generated for ${user.email}: ${code}`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

generate();
