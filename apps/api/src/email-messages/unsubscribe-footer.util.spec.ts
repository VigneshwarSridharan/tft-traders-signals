import { applyUnsubscribeFooter } from './unsubscribe-footer.util';

describe('applyUnsubscribeFooter', () => {
  it('appends the unsubscribe link and physical address to both bodies', () => {
    const result = applyUnsubscribeFooter('<p>Hi</p>', 'Hi', {
      unsubscribeUrl: 'https://track.test.local/u/abc123',
      physicalAddress: '123 Main St, Springfield',
    });

    expect(result.html).toContain('<p>Hi</p>');
    expect(result.html).toContain('https://track.test.local/u/abc123');
    expect(result.html).toContain('123 Main St, Springfield');
    expect(result.text).toContain(
      'Unsubscribe: https://track.test.local/u/abc123',
    );
    expect(result.text).toContain('123 Main St, Springfield');
  });

  it('omits the address line when none is configured, but still links to unsubscribe', () => {
    const result = applyUnsubscribeFooter('<p>Hi</p>', 'Hi', {
      unsubscribeUrl: 'https://track.test.local/u/abc123',
      physicalAddress: '',
    });

    expect(result.html).toContain('https://track.test.local/u/abc123');
    expect(result.text).toBe(
      'Hi\n\nUnsubscribe: https://track.test.local/u/abc123',
    );
  });

  it('escapes HTML-unsafe characters in the physical address', () => {
    const result = applyUnsubscribeFooter('<p>Hi</p>', 'Hi', {
      unsubscribeUrl: 'https://track.test.local/u/abc123',
      physicalAddress: '<script>alert(1)</script>',
    });

    expect(result.html).not.toContain('<script>alert(1)</script>');
    expect(result.html).toContain('&lt;script&gt;');
  });
});
