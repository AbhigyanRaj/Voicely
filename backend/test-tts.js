import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import SarvamService from './src/services/sarvamService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testSarvamTTS() {
    console.log('--- Starting Sarvam TTS Test ---');
    
    if (!process.env.SARVAM_API_KEY) {
        console.error('ERROR: SARVAM_API_KEY is not defined in your .env file.');
        console.error('Please add SARVAM_API_KEY=your_key_here to backend/.env and try again.');
        process.exit(1);
    }
    
    console.log('SARVAM_API_KEY found in environment variables.');
    
    const sarvam = new SarvamService();
    const testText = "नमस्ते, मैं वोक एआई से बात कर रही हूँ। मैं आपकी कैसे मदद कर सकती हूँ?";
    const languageCode = 'hi-IN'; // Sarvam supports hi-IN, en-IN etc.
    
    console.log(`\nSynthesizing text: "${testText}"`);
    console.log(`Target Language: ${languageCode}`);
    console.log(`Initiating API request to Sarvam...`);
    
    try {
        const startTime = Date.now();
        const audioBase64 = await sarvam.synthesizeMulaw(testText, languageCode);
        const duration = Date.now() - startTime;
        
        if (audioBase64) {
            console.log(`Success! Audio received in ${duration}ms.`);
            
            // Convert base64 to absolute binary and save
            const audioBuffer = Buffer.from(audioBase64, 'base64');
            
            // Ensure audio directory exists
            const audioDir = path.join(__dirname, 'src', 'audio');
            if (!fs.existsSync(audioDir)) {
                fs.mkdirSync(audioDir, { recursive: true });
            }
            
            const outputPath = path.join(audioDir, 'test_sarvam_output.wav'); 
            
            // The API returns MULAW encoding. Standard wav headers would be needed to play this
            // natively on Mac easily, but for a simple test we'll just write the raw buffer.
            // Some players like VLC can play raw mulaw. 
            fs.writeFileSync(outputPath, audioBuffer);
            
            console.log(`\n🔊 Audio saved to: ${outputPath}`);
            console.log(`File size: ${audioBuffer.length} bytes`);
            console.log(`Note: The file is raw MULAW 8000Hz. You can play it using VLC or ffplay.`);
            console.log(`Example: ffplay -f mulaw -ar 8000 -ac 1 ${outputPath}`);
            
        } else {
            console.error('Failed! Audio data was null/undefined.');
        }
    } catch (error) {
        console.error('Error during synthesis:', error.message);
    }
}

testSarvamTTS();
