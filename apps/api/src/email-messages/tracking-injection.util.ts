import * as cheerio from 'cheerio';
import { generatePublicToken } from '../common/id.util';

export interface RewrittenLink {
  token: string;
  originalUrl: string;
  label: string | null;
  position: number;
}

export interface ApplyTrackingResult {
  html: string;
  links: RewrittenLink[];
}

const UNTRACKED_HREF_PREFIXES = ['mailto:', 'tel:', '#'];

export function applyTracking(
  html: string,
  params: { publicToken: string; trackingDomain: string },
): ApplyTrackingResult {
  const $ = cheerio.load(html);
  const links: RewrittenLink[] = [];
  let position = 0;

  $('a[href]').each((_index, el) => {
    const href = $(el).attr('href')?.trim();
    if (
      !href ||
      UNTRACKED_HREF_PREFIXES.some((prefix) => href.startsWith(prefix))
    ) {
      return;
    }
    const token = generatePublicToken();
    links.push({
      token,
      originalUrl: href,
      label: $(el).text().trim() || null,
      position: position++,
    });
    $(el).attr('href', `https://${params.trackingDomain}/c/${token}`);
  });

  const pixelTag = `<img src="https://${params.trackingDomain}/o/${params.publicToken}.gif" width="1" height="1" alt="" style="display:none" />`;
  $('body').append(pixelTag);

  return { html: $.html(), links };
}

/**
 * Reverses `applyTracking` for read-only display (e.g. the sent-mail detail
 * page): drops the open-tracking pixel `<img>` so simply rendering the
 * stored HTML in a staff browser can't fire a real open event, and rewrites
 * click-tracking hrefs back to their original destination so viewing the
 * message doesn't misattribute clicks either. `body_html_rendered` itself is
 * left untouched — this only sanitizes the copy handed back over the API.
 */
export function stripTrackingForPreview(
  html: string,
  linkTokenToUrl: Map<string, string>,
): string {
  const $ = cheerio.load(html);

  $('img').each((_index, el) => {
    const src = $(el).attr('src');
    if (src && /\/o\/[^/]+\.gif(?:[?#].*)?$/.test(src)) {
      $(el).remove();
    }
  });

  $('a[href]').each((_index, el) => {
    const href = $(el).attr('href');
    const token = href?.match(/\/c\/([^/?#]+)/)?.[1];
    const originalUrl = token ? linkTokenToUrl.get(token) : undefined;
    if (originalUrl) {
      $(el).attr('href', originalUrl);
    }
  });

  return $.html();
}
