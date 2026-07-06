import {
  evaluateClickBotSignals,
  isScannerUserAgent,
} from './bot-detection.util';

describe('isScannerUserAgent', () => {
  it('flags known security-scanner user agents', () => {
    expect(isScannerUserAgent('Mimecast/1.0 URL-scanner')).toBe(true);
    expect(isScannerUserAgent('Barracuda Sentinel Link Checker')).toBe(true);
  });

  it('does not flag ordinary browser user agents', () => {
    expect(
      isScannerUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      ),
    ).toBe(false);
  });

  it('handles a null user agent', () => {
    expect(isScannerUserAgent(null)).toBe(false);
  });
});

describe('evaluateClickBotSignals', () => {
  const baseInput = {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
    secondsSinceSent: 45,
    minSeconds: 3,
    recentDistinctLinkClicks: 1,
    isHostingProviderIp: false,
  };

  it('is not flagged as bot for an ordinary, well-timed human click', () => {
    expect(evaluateClickBotSignals(baseInput)).toEqual({
      isBot: false,
      reasons: [],
    });
  });

  it('flags a click that happens faster than the configured threshold', () => {
    const result = evaluateClickBotSignals({
      ...baseInput,
      secondsSinceSent: 1.2,
    });
    expect(result.isBot).toBe(true);
    expect(result.reasons).toContain('clicked_too_fast');
  });

  it('flags Outlook-SafeLinks-style scanner user agents', () => {
    const result = evaluateClickBotSignals({
      ...baseInput,
      userAgent: 'Outlook-SafeLinks/1.0',
    });
    expect(result.isBot).toBe(true);
    expect(result.reasons).toContain('scanner_user_agent');
  });

  it('flags all-links-clicked-instantly behavior', () => {
    const result = evaluateClickBotSignals({
      ...baseInput,
      recentDistinctLinkClicks: 3,
    });
    expect(result.isBot).toBe(true);
    expect(result.reasons).toContain('all_links_instant');
  });

  it('flags datacenter/hosting-provider IPs', () => {
    const result = evaluateClickBotSignals({
      ...baseInput,
      isHostingProviderIp: true,
    });
    expect(result.isBot).toBe(true);
    expect(result.reasons).toContain('datacenter_ip');
  });

  it('does not apply the timing heuristic when sent_at is unknown', () => {
    const result = evaluateClickBotSignals({
      ...baseInput,
      secondsSinceSent: null,
    });
    expect(result.isBot).toBe(false);
  });
});
