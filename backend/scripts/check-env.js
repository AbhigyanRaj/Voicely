/**
 * Verify the environment matches what the server actually requires.
 *
 * Kept in sync with src/utils/envValidator.js. The previous version loaded
 * scripts/.env (which never exists) and checked five providers the product no
 * longer uses, so it reported a correctly-configured server as broken.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const REQUIRED = [
  ['MONGODB_URI', 'Database connection string'],
  ['JWT_SECRET', 'Signs dashboard session tokens'],
  ['ENCRYPTION_KEY', 'Encrypts stored provider credentials (64 hex chars)'],
  ['DEEPGRAM_API_KEY', 'Speech-to-text'],
  ['GROQ_API_KEY', 'Conversational LLM'],
  ['CARTESIA_API_KEY', 'Text-to-speech'],
];

const OPTIONAL = [
  ['GOOGLE_CLIENT_ID', 'Required for Google sign-in; without it /auth/google refuses every request'],
  ['REDIS_URL', 'Response cache; falls back to an in-process cache'],
  ['DEEPGRAM_MODEL', 'Defaults to nova-2-phonecall'],
  ['SPECULATIVE_PREFILL', 'Set to false to trade latency back for LLM spend'],
  ['LOG_LEVEL', 'Defaults to info; set debug to see per-turn detail'],
  ['PORT', 'Defaults to 10000'],
];

console.log('\nEnvironment check\n' + '='.repeat(62));

let missing = 0;
console.log('\nRequired:');
for (const [key, description] of REQUIRED) {
  const value = process.env[key];
  if (value && value.trim() !== '') {
    console.log(`  OK       ${key}`);
  } else {
    console.log(`  MISSING  ${key}  -- ${description}`);
    missing++;
  }
}

console.log('\nOptional:');
for (const [key, description] of OPTIONAL) {
  const value = process.env[key];
  console.log(`  ${value && value.trim() !== '' ? 'set     ' : 'unset   '} ${key}  -- ${description}`);
}

// The one required value with a format constraint: crypto.createCipheriv needs
// exactly 32 bytes, so a wrong length fails at call time rather than at boot.
if (process.env.ENCRYPTION_KEY && !/^[0-9a-fA-F]{64}$/.test(process.env.ENCRYPTION_KEY)) {
  console.log('\n  WARNING  ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).');
  missing++;
}

console.log('\n' + '='.repeat(62));
if (missing > 0) {
  console.log(`${missing} problem(s). The server calls process.exit(1) on a missing required var.\n`);
  process.exit(1);
}
console.log('All required environment variables are present.\n');
