import {
  applyTracking,
  stripTrackingForPreview,
} from './tracking-injection.util';

describe('applyTracking', () => {
  const params = {
    publicToken: 'msg-token',
    trackingDomain: 'track.test.local',
  };

  it('injects an open-tracking pixel referencing the public token', () => {
    const result = applyTracking('<html><body><p>Hi</p></body></html>', params);

    expect(result.html).toContain(
      '<img src="https://track.test.local/o/msg-token.gif"',
    );
  });

  it('rewrites http(s) links to click-redirect URLs and records the original', () => {
    const result = applyTracking(
      '<p><a href="https://example.com/quote?id=1">View quote</a></p>',
      params,
    );

    expect(result.links).toHaveLength(1);
    const [link] = result.links;
    expect(link.originalUrl).toBe('https://example.com/quote?id=1');
    expect(link.label).toBe('View quote');
    expect(link.position).toBe(0);
    expect(result.html).toContain(
      `<a href="https://track.test.local/c/${link.token}">`,
    );
    expect(result.html).not.toContain('https://example.com/quote?id=1');
  });

  it('leaves mailto:, tel:, and anchor links untouched', () => {
    const html =
      '<a href="mailto:sales@company.com">Email</a>' +
      '<a href="tel:+15551234567">Call</a>' +
      '<a href="#section">Jump</a>';
    const result = applyTracking(html, params);

    expect(result.links).toHaveLength(0);
    expect(result.html).toContain('href="mailto:sales@company.com"');
    expect(result.html).toContain('href="tel:+15551234567"');
    expect(result.html).toContain('href="#section"');
  });

  it('assigns each rewritten link a distinct token and increasing position', () => {
    const result = applyTracking(
      '<a href="https://a.example.com">A</a><a href="https://b.example.com">B</a>',
      params,
    );

    expect(result.links).toHaveLength(2);
    expect(result.links[0].position).toBe(0);
    expect(result.links[1].position).toBe(1);
    expect(result.links[0].token).not.toBe(result.links[1].token);
  });
});

describe('stripTrackingForPreview', () => {
  const params = {
    publicToken: 'msg-token',
    trackingDomain: 'track.test.local',
  };

  it('removes the open-tracking pixel so rendering the preview cannot fire an open event', () => {
    const tracked = applyTracking(
      '<html><body><p>Hi</p></body></html>',
      params,
    );

    const preview = stripTrackingForPreview(tracked.html, new Map());

    expect(preview).not.toContain('/o/msg-token.gif');
    expect(preview).not.toContain('<img');
  });

  it('rewrites click-tracking links back to their original destination', () => {
    const tracked = applyTracking(
      '<p><a href="https://example.com/quote?id=1">View quote</a></p>',
      params,
    );
    const [link] = tracked.links;

    const preview = stripTrackingForPreview(
      tracked.html,
      new Map([[link.token, link.originalUrl]]),
    );

    expect(preview).toContain('href="https://example.com/quote?id=1"');
    expect(preview).not.toContain(`/c/${link.token}`);
  });

  it('leaves an href untouched if its token has no known original URL', () => {
    const html = `<a href="https://track.test.local/c/unknown-token">Link</a>`;

    const preview = stripTrackingForPreview(html, new Map());

    expect(preview).toContain(
      'href="https://track.test.local/c/unknown-token"',
    );
  });
});
