import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import SarvamService from './src/services/sarvamService.js';
import { generateGoogleTTS } from './src/config/googleTTS.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testLatency() {
    console.log('--- Starting TTS Latency Test ---');
    
    if (!process.env.SARVAM_API_KEY) {
        console.error('❌ ERROR: SARVAM_API_KEY is not defined.');
        process.exit(1);
    }
    if (!process.env.GOOGLE_TTS_API_KEY && !process.env.GOOGLE_API_KEY) {
        console.error('❌ ERROR: Google TTS API key is not defined.');
        process.exit(1);
    }
    
    const testText = "नमस्ते, मैं वोक एआई से बात कर रही हूँ। मैं आपकी कैसे मदद कर सकती हूँ?";
    console.log(`\nSynthesizing text: "${testText}"`);
    console.log(`Text Length: ${testText.length} characters\n`);

    // 1. Test Sarvam AI
    console.log('--- Testing Sarvam AI ---');
    const sarvam = new SarvamService();
    let sarvamTime = 0;
    try {
        const startTime = Date.now();
        await sarvam.synthesizeMulaw(testText, 'hi-IN');
        sarvamTime = Date.now() - startTime;
        console.log(`✅ Sarvam AI completed in: ${sarvamTime}ms`);
    } catch (e) {
        console.error('Sarvam Error:', e.message);
    }

    // 2. Test Google TTS
    console.log('\n--- Testing Google TTS ---');
    let googleTime = 0;
    try {
        const startTime = Date.now();
        await generateGoogleTTS(testText, 'NEERJA');
        googleTime = Date.now() - startTime;
        console.log(`✅ Google TTS completed in: ${googleTime}ms`);
    } catch (e) {
        console.error('Google Error:', e.message);
    }

    // Results
    console.log('\n=== RESULTS ===');
    console.log(`Google TTS Latency: ${googleTime}ms`);
    console.log(`Sarvam AI Latency:  ${sarvamTime}ms`);
    
    const diff = Math.abs(googleTime - sarvamTime);
    if (sarvamTime < googleTime) {
        console.log(`🏆 Sarvam is faster by ${diff}ms (approx ${(diff/1000).toFixed(2)} seconds).`);
    } else {
        console.log(`🏆 Google is faster by ${diff}ms (approx ${(diff/1000).toFixed(2)} seconds).`);
    }
}

testLatency();
