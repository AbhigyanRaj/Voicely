import dotenv from 'dotenv';
import SarvamService from './src/services/sarvamService.js';
dotenv.config();

async function test() {
    const sarvam = new SarvamService();
    try {
        const resBase64 = await sarvam.synthesizeMulaw("Hello", 'hi-IN', 'anushka');
        if (resBase64) {
            const buf = Buffer.from(resBase64, 'base64');
            // Look for "data" chunk which is 'd' 'a' 't' 'a' (0x64 0x61 0x74 0x61)
            let dataOffset = 0;
            for(let i = 0; i < buf.length - 4; i++) {
                if(buf[i] === 0x64 && buf[i+1] === 0x61 && buf[i+2] === 0x74 && buf[i+3] === 0x61) {
                    dataOffset = i + 8; // skip "data" and the 4 byte size
                    break;
                }
            }
            console.log("Found data offset at:", dataOffset);
            console.log("Original length:", buf.length);
            console.log("Stripped length:", buf.length - dataOffset);
        }
    } catch(e) {
        console.error(e);
    }
}
test();
