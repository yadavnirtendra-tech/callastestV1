import { describe, it, expect, beforeAll } from 'vitest';

// Set test encryption key before importing
process.env.ENCRYPTION_KEY = 'a'.repeat(64);
process.env.NODE_ENV = 'test';

import { encrypt, decrypt, sha256Hash, secureCompare } from '../crypto/encryption';

describe('encrypt / decrypt', () => {
  it('round-trips a plain string', () => {
    const plain = 'Hello, CalendarSync!';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it('round-trips an email address', () => {
    const email = 'user@example.com';
    expect(decrypt(encrypt(email))).toBe(email);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const plain = 'same input';
    expect(encrypt(plain)).not.toBe(encrypt(plain));
  });

  it('returns empty string for empty input', () => {
    expect(encrypt('')).toBe('');
    expect(decrypt('')).toBe('');
  });

  it('throws on tampered auth tag', () => {
    const enc = encrypt('secret');
    const buf = Buffer.from(enc, 'base64');
    // Flip a byte inside the auth tag (bytes 16-31) — GCM always rejects this
    buf[16] ^= 0xff;
    expect(() => decrypt(buf.toString('base64'))).toThrow();
  });
});

describe('sha256Hash', () => {
  it('produces consistent 64-char hex', () => {
    const h = sha256Hash('test input');
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]+$/);
    expect(sha256Hash('test input')).toBe(h);
  });

  it('different inputs produce different hashes', () => {
    expect(sha256Hash('a')).not.toBe(sha256Hash('b'));
  });
});

describe('secureCompare', () => {
  it('returns true for equal strings', () => {
    expect(secureCompare('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    expect(secureCompare('abc', 'abd')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(secureCompare('abc', 'abcd')).toBe(false);
  });
});
