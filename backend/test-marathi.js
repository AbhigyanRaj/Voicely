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
                inputs: ["Hello there, how are you? I am a router support bot."],
                target_language_code: 'mr-IN',
                speaker: 'manisha',
                model: 'bulbul:v2',
                sampling_rate: 8000,
                enable_preprocessing: true
            })
        });
        const data = await res.json();
        if (data.error) {
            console.log("Failed with English text:", data.error.message);
        } else {
            console.log("Success with English text");
        }
    } catch(e) {
        console.error("Error:", e);
    }
}
test();
