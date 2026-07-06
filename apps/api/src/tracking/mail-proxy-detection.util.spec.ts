import { detectMailProxy } from './mail-proxy-detection.util';

describe('detectMailProxy', () => {
  it('flags the Apple Mail Privacy Protection prefetch user agent', () => {
    const result = detectMailProxy(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_6) AppleWebKit/605.1.15 (KHTML, like Gecko)',
    );
    expect(result).toEqual({ isAppleMpp: true, isGmailProxy: false });
  });

  it('flags the Gmail image proxy user agent', () => {
    const result = detectMailProxy('GoogleImageProxy');
    expect(result).toEqual({ isAppleMpp: false, isGmailProxy: true });
  });

  it('flags neither for an ordinary browser user agent', () => {
    const result = detectMailProxy(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    );
    expect(result).toEqual({ isAppleMpp: false, isGmailProxy: false });
  });

  it('handles a null user agent', () => {
    expect(detectMailProxy(null)).toEqual({
      isAppleMpp: false,
      isGmailProxy: false,
    });
  });
});
