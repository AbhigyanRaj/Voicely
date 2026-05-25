import { createClient } from '@deepgram/sdk';
import 'dotenv/config';

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

try {
  const connection = deepgram.listen.live({
    model: 'nova-3',
    detect_language: true,
    encoding: 'mulaw',
    sample_rate: 8000
  });

  connection.on('open', () => {
    console.log('SUCCESS: detect_language is supported!');
    connection.finish();
    process.exit(0);
  });

  connection.on('error', (err) => {
    console.log('ERROR:', err);
    process.exit(1);
  });

} catch (err) {
  console.log('CATCH ERROR:', err);
}
