import { generateMessageIdHeader, generatePublicToken } from './id.util';

describe('id.util', () => {
  it('generates unique base62 public tokens', () => {
    const first = generatePublicToken();
    const second = generatePublicToken();
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[0-9A-Za-z]+$/);
  });

  it('generates an RFC 5322 style Message-ID for the given domain', () => {
    const header = generateMessageIdHeader('example.com');
    expect(header).toMatch(/^<[0-9a-f-]+@example\.com>$/);
  });
});
