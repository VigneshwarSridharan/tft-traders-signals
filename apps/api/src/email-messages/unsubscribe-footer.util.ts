import * as cheerio from 'cheerio';

export interface ApplyUnsubscribeFooterParams {
  unsubscribeUrl: string;
  /** CAN-SPAM requires a valid physical postal address in every commercial email; empty string omits the line. */
  physicalAddress: string;
}

export interface ApplyUnsubscribeFooterResult {
  html: string;
  text: string;
}

/**
 * Appends a CAN-SPAM-compliant footer (physical address + unsubscribe link)
 * to both bodies. Applied unconditionally at compose time — regardless of
 * the per-send/per-customer tracking-pixel preference — so the footer can't
 * be removed by editing template content (Task 21's "enforced on
 * templates").
 */
export function applyUnsubscribeFooter(
  html: string,
  text: string,
  params: ApplyUnsubscribeFooterParams,
): ApplyUnsubscribeFooterResult {
  const $ = cheerio.load(html);
  const footerStyle =
    'margin-top:24px;padding-top:12px;border-top:1px solid #e4e4e7;color:#71717a;font-size:12px;';
  const footer = $('<div>').attr('style', footerStyle);

  if (params.physicalAddress) {
    footer.append(
      $('<p>').attr('style', 'margin:0 0 8px;').text(params.physicalAddress),
    );
  }

  const unsubscribeParagraph = $('<p>').attr('style', 'margin:0;');
  unsubscribeParagraph
    .append(
      $('<a>')
        .attr('href', params.unsubscribeUrl)
        .attr('style', 'color:#71717a;')
        .text('Unsubscribe'),
    )
    .append(' from these emails.');
  footer.append(unsubscribeParagraph);

  $('body').append(footer);

  const textLines = [text.trimEnd()];
  if (params.physicalAddress) {
    textLines.push('', params.physicalAddress);
  }
  textLines.push('', `Unsubscribe: ${params.unsubscribeUrl}`);

  return { html: $.html(), text: textLines.join('\n') };
}
