import dotenv from 'dotenv';
import SarvamService from './src/services/sarvamService.js';
dotenv.config();

async function test() {
    const sarvam = new SarvamService();
    const text = "Hello there! I am representing Vok AI. How can I assist you today?";
    console.log("Testing with hi-IN target but English text...");
    try {
        const res = await sarvam.synthesizeMulaw(text, 'hi-IN', 'anushka');
        if (res) console.log("Success");
        else console.log("Failed (null)");
    } catch (e) {
        console.error("Error:", e);
    }
}
test();
