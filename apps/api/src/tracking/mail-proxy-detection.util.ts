// Apple Mail Privacy Protection pre-fetches every pixel through Apple's own
// proxy, from a stripped-down WebKit UA with no trailing Version/Safari
// token — that shape is the documented fingerprint (there's no header or IP
// range Apple publishes for this).
const APPLE_MPP_UA_PATTERN =
  /^Mozilla\/5\.0 \(Macintosh; Intel Mac OS X [\d_]+\) AppleWebKit\/[\d.]+ \(KHTML, like Gecko\)$/;

// Gmail's image proxy (which rewrites <img src> for privacy) identifies
// itself with this literal User-Agent string.
const GMAIL_PROXY_UA_MARKER = 'GoogleImageProxy';

export interface MailProxySignals {
  isAppleMpp: boolean;
  isGmailProxy: boolean;
}

export function detectMailProxy(userAgent: string | null): MailProxySignals {
  if (!userAgent) {
    return { isAppleMpp: false, isGmailProxy: false };
  }
  return {
    isAppleMpp: APPLE_MPP_UA_PATTERN.test(userAgent.trim()),
    isGmailProxy: userAgent.includes(GMAIL_PROXY_UA_MARKER),
  };
}
