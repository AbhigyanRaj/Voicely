import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // Must be 32 bytes (64 hex characters)
const IV_LENGTH = 16;

/**
 * Encrypts a text string using AES-256-CBC
 * @param {string} text - The text to encrypt
 * @returns {string} - The iv and encrypted data separated by a colon
 */
export const encrypt = (text) => {
  if (!text) return text;
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is missing in environment variables');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  return iv.toString('hex') + ':' + encrypted.toString('hex');
};

/**
 * Decrypts a previously encrypted string
 * @param {string} text - The encrypted string (iv:encryptedData)
 * @returns {string} - The decrypted text
 */
export const decrypt = (text) => {
  if (!text) return text;
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY is missing in environment variables');
  }

  const textParts = text.split(':');
  if (textParts.length !== 2) return text; // Not encrypted in expected format

  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString();
};
