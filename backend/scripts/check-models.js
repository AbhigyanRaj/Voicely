import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function listModels() {
  try {
    console.log('Using API Key:', process.env.GEMINI_API_KEY.substring(0, 10) + '...');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // We try to list models. Note: listModels is on the genAI instance or requires specific versions
    // If listModels isn't available, we'll try a basic probe
    console.log('Probing for available models...');
    
    // Try v1 first
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    
    if (data.models) {
        console.log('Available Models (v1):');
        data.models.forEach(m => console.log(`- ${m.name}`));
    } else {
        console.log('No models found in v1 response:', data);
    }

    // Try v1beta
    const responseBeta = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const dataBeta = await responseBeta.json();
    
    if (dataBeta.models) {
        console.log('\nAvailable Models (v1beta):');
        dataBeta.models.forEach(m => console.log(`- ${m.name}`));
    } else {
        console.log('No models found in v1beta response:', dataBeta);
    }

  } catch (error) {
    console.error('Error listing models:', error);
  }
}

listModels();
