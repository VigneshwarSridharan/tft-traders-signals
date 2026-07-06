import { UAParser } from 'ua-parser-js';

export interface ParsedUserAgent {
  deviceType: string | null;
  os: string | null;
  browser: string | null;
}

export function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  if (!userAgent) {
    return { deviceType: null, os: null, browser: null };
  }
  const result = UAParser(userAgent);
  return {
    deviceType: result.device.type ?? 'desktop',
    os: result.os.name ?? null,
    browser: result.browser.name ?? null,
  };
}
