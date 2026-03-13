import dotenv from 'dotenv';
import { createClient } from '@deepgram/sdk';
dotenv.config();

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

async function testLang(langCode) {
    return new Promise((resolve) => {
        console.log(`Testing Deepgram connection with language: ${langCode}...`);
        
        try {
            const connection = deepgram.listen.live({
                model: 'nova-2',
                language: langCode,
                encoding: 'mulaw',
                sample_rate: 8000
            });
            
            let success = false;
            
            connection.on('open', () => {
                success = true;
                console.log(`[SUCCESS] Deepgram accepts language code: ${langCode}`);
                connection.finish();
                resolve(true);
            });
            
            connection.on('error', (err) => {
                console.error(`[ERROR] Deepgram rejected language code ${langCode}. Reason:`, err);
                connection.finish();
                resolve(false);
            });
            
            setTimeout(() => {
                if(!success) {
                    console.log(`[TIMEOUT] Deepgram connection timed out for ${langCode}`);
                    connection.finish();
                    resolve(false);
                }
            }, 3000);
            
        } catch(e) {
            console.error(`[FATAL] Error testing ${langCode}:`, e.message);
            resolve(false);
        }
    });
}

async function run() {
    await testLang('mr'); // Marathi
    console.log("Tests complete.");
    process.exit(0);
}

run();
