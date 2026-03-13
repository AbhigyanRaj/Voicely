import dotenv from 'dotenv';
import fetch from 'node-fetch';
import SarvamService from './src/services/sarvamService.js';
dotenv.config();

async function test() {
    const sarvam = new SarvamService();
    try {
        const res = await fetch(sarvam.ttsUrl, {
            method: 'POST',
            headers: {
                'api-subscription-key': sarvam.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: ["Hello"],
                target_language_code: 'en-IN',
                speaker: 'aditya',
                model: 'bulbul:v2',
                sampling_rate: 8000,
                enable_preprocessing: true
            })
        });
        const data = await res.json();
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch(e) {
        console.error("Error:", e);
    }
}
test();
