const SCANNER_UA_PATTERN =
  /bot|crawler|spider|slurp|scanner|proofpoint|mimecast|barracuda|forcepoint|ironport|safelinks|virustotal|urlscan|phishlabs|trendmicro|symantec|link[- ]?check/i;

export function isScannerUserAgent(userAgent: string | null): boolean {
  return Boolean(userAgent && SCANNER_UA_PATTERN.test(userAgent));
}

// Corporate link-scanners typically fetch every link in an email within
// milliseconds of delivery; three or more distinct links clicked on the same
// message inside the window is well outside human behavior.
const ALL_LINKS_INSTANT_THRESHOLD = 3;

export interface ClickBotSignalInput {
  userAgent: string | null;
  secondsSinceSent: number | null;
  minSeconds: number;
  recentDistinctLinkClicks: number;
  isHostingProviderIp: boolean;
}

export interface BotSignalResult {
  isBot: boolean;
  reasons: string[];
}

export function evaluateClickBotSignals(
  input: ClickBotSignalInput,
): BotSignalResult {
  const reasons: string[] = [];
  if (isScannerUserAgent(input.userAgent)) {
    reasons.push('scanner_user_agent');
  }
  if (
    input.secondsSinceSent !== null &&
    input.secondsSinceSent < input.minSeconds
  ) {
    reasons.push('clicked_too_fast');
  }
  if (input.recentDistinctLinkClicks >= ALL_LINKS_INSTANT_THRESHOLD) {
    reasons.push('all_links_instant');
  }
  if (input.isHostingProviderIp) {
    reasons.push('datacenter_ip');
  }
  return { isBot: reasons.length > 0, reasons };
}
