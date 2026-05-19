// ============================================================
// Enterprise Calendar Sync — AES-256-GCM Encryption
// ============================================================
// Military-grade encryption for OAuth tokens and sensitive data.
// Uses AES-256-GCM (authenticated encryption) — tamper-proof.
// ============================================================

import crypto from 'crypto';
import config from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;      // 128-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit authentication tag
const KEY_LENGTH = 32;      // 256-bit key

/**
 * Derive a proper 256-bit key from the config encryption key.
 * Uses PBKDF2 for key derivation — resistant to brute force.
 */
function getEncryptionKey(): Buffer {
  const rawKey = config.encryption.key;
  if (!rawKey) {
    throw new Error('[CRYPTO] ENCRYPTION_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  // If the key is already a 64-char hex string (32 bytes), use it directly
  if (/^[0-9a-f]{64}$/i.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }
  // Otherwise, derive a key using PBKDF2
  return crypto.pbkdf2Sync(rawKey, 'calendarsync-enterprise-salt', 100000, KEY_LENGTH, 'sha512');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns: base64(iv + authTag + ciphertext)
 * 
 * The authentication tag prevents tampering — if anyone modifies
 * the encrypted data, decryption will fail.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();

  // Format: IV (16) + AuthTag (16) + Ciphertext (variable)
  const result = Buffer.concat([iv, authTag, encrypted]);
  return result.toString('base64');
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext.
 * Verifies authentication tag — throws if data was tampered with.
 */
export function decrypt(encryptedBase64: string): string {
  if (!encryptedBase64) return '';

  const key = getEncryptionKey();
  const buffer = Buffer.from(encryptedBase64, 'base64');

  if (buffer.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('[CRYPTO] Invalid encrypted data — too short');
  }

  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString('utf8');
}

/**
 * Create a SHA-256 hash of a string.
 * Used for sync fingerprints and deduplication.
 */
export function sha256Hash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Create a SHA-512 HMAC for webhook signature verification.
 */
export function hmacSha256(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Generate a cryptographically secure random string.
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Hash sensitive data for comparison without storing plaintext.
 * Uses HMAC to prevent rainbow table attacks.
 */
export function hashForComparison(data: string): string {
  const key = getEncryptionKey();
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}
