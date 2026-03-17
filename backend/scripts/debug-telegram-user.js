import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const UserSchema = new mongoose.Schema({
  email: String,
  telegram: {
    chatId: String,
    linkingCode: {
      code: String,
      expiresAt: Date,
    },
  },
}, { strict: false });

const User = mongoose.model('User', UserSchema);

async function checkUser() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to Host:', mongoose.connection.host);
  console.log('Database Name:', mongoose.connection.name);
  console.log('Collection Name:', User.collection.name);

  const users = await User.find({});
  console.log('--- ALL USERS WITH TELEGRAM ---');
  let found = false;
  users.forEach(u => {
    if (u.telegram && u.telegram.chatId) {
      console.log(`Email: ${u.email}, ChatId: ${u.telegram.chatId}, ID: ${u._id}`);
      found = true;
    }
  });
  if (!found) console.log('No users found with telegram.chatId');

  const abhigyanUser = await User.findOne({ email: 'abhigyanraj673@gmail.com' });
  console.log('--- ABHIGYAN USER FULL STATE ---');
  console.log(JSON.stringify(abhigyanUser, null, 2));

  await mongoose.disconnect();
}

checkUser().catch(console.error);
