import dotenv from 'dotenv';
import SarvamService from './src/services/sarvamService.js';
dotenv.config();

async function test() {
    const sarvam = new SarvamService();
    // Using the same request that succeeded earlier
    const resBase64 = await sarvam.synthesizeMulaw("Hello", 'hi-IN', 'anushka');
    if (!resBase64) {
        console.log("No response");
        return;
    }
    const buf = Buffer.from(resBase64, 'base64');
    
    // Parse WAV header. Note: we patched synthesizeMulaw to STRIP the header!
    // Oh, I stripped the header inside synthesizeMulaw. Let me get the raw response.
    const res = await fetch(sarvam.ttsUrl, {
        method: 'POST',
        headers: {
            'api-subscription-key': sarvam.apiKey,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            inputs: ["Hello"],
            target_language_code: 'hi-IN',
            speaker: 'anushka',
            model: 'bulbul:v2',
            sampling_rate: 8000,
            enable_preprocessing: true
        })
    });
    const data = await res.json();
    const rawB64 = data.audios[0];
    const rawBuf = Buffer.from(rawB64, 'base64');
    
    const format = rawBuf.readUInt16LE(20);
    const channels = rawBuf.readUInt16LE(22);
    const sampleRate = rawBuf.readUInt32LE(24);
    const byteRate = rawBuf.readUInt32LE(28);
    const blockAlign = rawBuf.readUInt16LE(32);
    const bitsPerSample = rawBuf.readUInt16LE(34);
    
    console.log("Sarvam Returns:");
    console.log("Format tag:", format, (format === 1 ? "(Linear PCM)" : (format === 7 ? "(Mu-law)" : format)));
    console.log("Channels:", channels);
    console.log("Sample Rate:", sampleRate);
    console.log("Bits Per Sample:", bitsPerSample);
}
test();
