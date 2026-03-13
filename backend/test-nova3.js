import dotenv from 'dotenv';
import { createClient } from '@deepgram/sdk';
dotenv.config();

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

async function testLang(langCode) {
    return new Promise((resolve) => {
        try {
            const connection = deepgram.listen.live({
                model: 'nova-3',
                language: langCode,
                encoding: 'mulaw',
                sample_rate: 8000
            });
            let success = false;
            connection.on('open', () => {
                success = true;
                console.log(`[SUCCESS] Nova-3 accepts: ${langCode}`);
                connection.finish();
                resolve(true);
            });
            connection.on('error', (err) => {
                console.error(`[ERROR] Nova-3 rejected ${langCode}`);
                connection.finish();
                resolve(false);
            });
        } catch(e) {
            resolve(false);
        }
    });
}

async function run() {
    for (const lang of ['bn', 'te', 'mr', 'ta', 'kn', 'gu', 'ml', 'or', 'pa']) {
        await testLang(lang);
    }
    console.log("Done");
    process.exit(0);
}
run();
