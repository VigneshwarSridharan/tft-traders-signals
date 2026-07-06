import { decryptSecret, encryptSecret } from './crypto.util';

describe('crypto.util', () => {
  const key = 'a-super-secret-encryption-key-1234567890';

  it('round-trips plaintext through encrypt/decrypt', () => {
    const envelope = encryptSecret('super-secret-app-password', key);
    expect(decryptSecret(envelope, key)).toBe('super-secret-app-password');
  });

  it('produces a different envelope on each call (random IV)', () => {
    const first = encryptSecret('same-password', key);
    const second = encryptSecret('same-password', key);
    expect(first.equals(second)).toBe(false);
  });

  it('fails to decrypt with the wrong key', () => {
    const envelope = encryptSecret('super-secret-app-password', key);
    expect(() =>
      decryptSecret(envelope, 'a-different-encryption-key-000000'),
    ).toThrow();
  });

  it('fails to decrypt a tampered envelope', () => {
    const envelope = encryptSecret('super-secret-app-password', key);
    envelope[envelope.length - 1] ^= 0xff;
    expect(() => decryptSecret(envelope, key)).toThrow();
  });
});
