import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../backend/.env') });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    // Note: The JS SDK doesn't have a direct listModels, we usually check via the API or known slugs
    // But we can try to hit the models endpoint directly via fetch
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    console.log('Available Models:');
    data.models.forEach(m => console.log(`- ${m.name}`));
  } catch (error) {
    console.error('Error listing models:', error.message);
  }
}

listModels();
