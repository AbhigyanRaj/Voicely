import dotenv from 'dotenv';
import twilio from 'twilio';

dotenv.config();

// Bypass the local SSL issue
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function run() {
    try {
        console.log("Attempting to initiate Twilio call...");
        const call = await client.calls.create({
            method: 'POST',
            url: 'http://demo.twilio.com/docs/voice.xml',
            to: '+918595192809',
            from: process.env.TWILIO_PHONE_NUMBER,
        });
        console.log("Call created successfully:", call.sid);
    } catch (e) {
        console.error("Twilio Error:");
        console.error("Status:", e.status);
        console.error("Code:", e.code);
        console.error("Message:", e.message);
        console.error("More Info:", e.moreInfo);
    }
}

run();
