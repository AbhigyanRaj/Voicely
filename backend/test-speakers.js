import dotenv from 'dotenv';
import fetch from 'node-fetch';
import SarvamService from './src/services/sarvamService.js';
dotenv.config();

async function test() {
    const sarvam = new SarvamService();
    const speakers = ['anushka', 'abhilash', 'manisha', 'vidya', 'arya', 'karun', 'hitesh'];
    const langs = ['en-IN', 'hi-IN', 'bn-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'or-IN', 'pa-IN', 'ta-IN', 'te-IN'];
    
    // We'll just test language en-IN against all 7 to see if they are multilingual, 
    // and maybe hi-IN too.
    for (const speaker of speakers) {
        try {
            const res = await fetch(sarvam.ttsUrl, {
                method: 'POST',
                headers: {
                    'api-subscription-key': sarvam.apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: ["Hello"],
                    target_language_code: 'hi-IN',
                    speaker: speaker,
                    model: 'bulbul:v2',
                    sampling_rate: 8000,
                    enable_preprocessing: true
                })
            });
            const data = await res.json();
            if (data.error) {
                console.log(`Speaker ${speaker} for hi-IN failed: ${data.error.message}`);
            } else {
                console.log(`Speaker ${speaker} works for hi-IN!`);
            }
        } catch(e) {
            console.error(`Error for ${speaker}:`, e.message);
        }
    }
}
test();
