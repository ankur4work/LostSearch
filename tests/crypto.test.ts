import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '@/lib/crypto';

describe('crypto: AES-256-GCM round-trip', () => {
  it('decrypts what it encrypts', () => {
    const plaintext = 'shpat_abc123_offline_token';
    const ct = encrypt(plaintext);
    expect(ct).not.toContain(plaintext);
    expect(decrypt(ct)).toBe(plaintext);
  });

  it('produces different ciphertext for the same plaintext (fresh IV)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it('rejects tampered ciphertext via auth tag', () => {
    const ct = encrypt('secret');
    const [v, iv, tag, payload] = ct.split(':');
    const flipped = Buffer.from(payload!, 'base64');
    flipped[0] ^= 0x01;
    const tampered = [v, iv, tag, flipped.toString('base64')].join(':');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('rejects malformed payloads', () => {
    expect(() => decrypt('not-a-payload')).toThrow();
    expect(() => decrypt('v0:aa:bb:cc')).toThrow();
  });
});
