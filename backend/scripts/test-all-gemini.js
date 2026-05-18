import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const CANDIDATES = [
    { name: "gemini-1.5-flash", version: "v1" },
    { name: "gemini-1.5-flash", version: "v1beta" },
    { name: "gemini-flash-latest", version: "v1" },
    { name: "gemini-flash-latest", version: "v1beta" },
    { name: "gemini-2.0-flash", version: "v1" },
    { name: "gemini-2.0-flash", version: "v1beta" },
    { name: "gemini-pro", version: "v1" },
    { name: "gemini-pro-latest", version: "v1beta" }
];

async function testModel(candidate) {
    console.log(`\nTesting: [Model: ${candidate.name}] [API: ${candidate.version}]...`);
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: candidate.name }, { apiVersion: candidate.version });
        
        const startTime = Date.now();
        const result = await model.generateContent("Say 'Hello'");
        const response = await result.response;
        const text = response.text();
        const duration = Date.now() - startTime;
        
        console.log(`✅ SUCCESS: Received "${text.trim()}" in ${duration}ms`);
        return { ...candidate, success: true, duration };
    } catch (error) {
        console.error(`❌ FAILED: ${error.message.substring(0, 100)}`);
        return { ...candidate, success: false, error: error.message };
    }
}

async function runIndepthTest() {
    console.log('--- IN-DEPTH GEMINI STABILITY TEST ---');
    console.log('Using Key:', process.env.GEMINI_API_KEY.substring(0, 10) + '...');
    
    const results = [];
    for (const candidate of CANDIDATES) {
        const result = await testModel(candidate);
        results.push(result);
        // Wait 2s between tests to avoid transient 429s during testing
        await new Promise(r => setTimeout(r, 2000));
    }
    
    console.log('\n\n=== FINAL TEST SUMMARY ===');
    const successful = results.filter(r => r.success).sort((a, b) => a.duration - b.duration);
    
    if (successful.length > 0) {
        console.log('TOP RECOMMENDATIONS (Fastest First):');
        successful.forEach((r, i) => {
            console.log(`${i + 1}. ${r.name} (${r.version}) - ${r.duration}ms`);
        });
        
        const winner = successful[0];
        console.log(`\n🏆 WINNER: [${winner.name}] on [${winner.version}]`);
    } else {
        console.log('CRITICAL: All tested models failed for this API key.');
    }
}

runIndepthTest();
