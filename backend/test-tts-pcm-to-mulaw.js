import dotenv from 'dotenv';
import fs from 'fs';
import SarvamService from './src/services/sarvamService.js';
dotenv.config();

async function test() {
    const sarvam = new SarvamService();
    console.log("Synthesizing and converting...");
    try {
        const resBase64 = await sarvam.synthesizeMulaw("Hello there, this is a longer sentence to test if the audio is clear and understandable after the massive transcoding process.", 'en-IN', 'arya');
        if (resBase64) {
            console.log("Success! Checking audio format...");
            const buf = Buffer.from(resBase64, 'base64');
            console.log(`Buffer length: ${buf.length} bytes`);
            
            // Save the raw buffer to test its playback later if needed
            fs.writeFileSync('src/audio/test_sarvam_mulaw.raw', buf);
            console.log("Saved raw mulaw stream to src/audio/test_sarvam_mulaw.raw");
            console.log("Play this raw file using: ffplay -f mulaw -ar 8000 -ac 1 src/audio/test_sarvam_mulaw.raw");
        } else {
            console.error("No audio returned");
        }
    } catch (e) {
        console.error(e);
    }
}
test();
