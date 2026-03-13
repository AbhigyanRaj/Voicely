import dotenv from 'dotenv';
import DeepgramService from './src/services/deepgramService.js';
dotenv.config();

async function test() {
    const dg = new DeepgramService();
    try {
        console.log("Testing Deepgram with language 'ta' (Tamil)...");
        await dg.createLiveConnection({
            model: 'nova-2',
            language: 'ta',
            encoding: 'mulaw',
            sample_rate: 8000
        });
        console.log("Supported 'ta'!");
        dg.close();
    } catch(e) {
        console.error("Error for 'ta':", e.message || e);
    }
}
test();
