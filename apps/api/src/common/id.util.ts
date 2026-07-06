import { randomBytes, randomUUID } from 'node:crypto';

const BASE62_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function toBase62(bytes: Buffer): string {
  let value = BigInt(`0x${bytes.toString('hex')}`);
  if (value === 0n) {
    return '0';
  }
  const base = BigInt(BASE62_ALPHABET.length);
  let result = '';
  while (value > 0n) {
    const remainder = Number(value % base);
    result = BASE62_ALPHABET[remainder] + result;
    value /= base;
  }
  return result;
}

/** 128-bit random token, base62-encoded — used for pixel/click/unsubscribe URLs. */
export function generatePublicToken(): string {
  return toBase62(randomBytes(16));
}

/** RFC 5322 Message-ID header value, e.g. `<uuid@domain>`. */
export function generateMessageIdHeader(domain: string): string {
  return `<${randomUUID()}@${domain}>`;
}
