import fetch from 'node-fetch';

const API_URL = 'http://localhost:5001/api';
// You'll need a valid JWT token to run this test properly
const TOKEN = 'YOUR_JWT_TOKEN_HERE';

async function testLinking() {
    console.log('🧪 Testing Telegram Linking Code Generation...');

    try {
        const response = await fetch(`${API_URL}/auth/telegram/link-code`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (data.success) {
            console.log('✅ Success! Linking Code:', data.code);
            console.log('⏰ Expires At:', data.expiresAt);
            console.log('\nNext Step: Go to Telegram and send:');
            console.log(`/start ${data.code}`);
        } else {
            console.log('❌ Failed:', data.error);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

// testLinking();
console.log('Test script ready. Requires manual execution or valid token injection.');
