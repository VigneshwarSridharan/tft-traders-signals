import { simpleParser } from 'mailparser';
import type { BounceClass } from '@tft/shared';

export interface DsnParseResult {
  isDsn: boolean;
  bounceClass: BounceClass | null;
  statusCode: string | null;
  diagnostic: string | null;
  finalRecipient: string | null;
  originalMessageId: string | null;
}

const STATUS_RE = /^Status:\s*([245])\.(\d{1,3})\.(\d{1,3})/im;
const ACTION_RE = /^Action:\s*(\S+)/im;
const DIAGNOSTIC_RE = /^Diagnostic-Code:\s*(.+)$/im;
const FINAL_RECIPIENT_RE = /^Final-Recipient:\s*(?:rfc822;\s*)?(.+)$/im;
const MESSAGE_ID_HEADER_RE = /^Message-ID:\s*(<[^>]+>)/im;

function classifyFromAction(action: string | null): BounceClass | null {
  switch (action?.toLowerCase()) {
    case 'failed':
      return 'hard';
    case 'delayed':
      return 'soft';
    default:
      return null;
  }
}

/**
 * Parses a raw RFC 822 message that may be a delivery status notification
 * (RFC 3464 bounce report). mailparser merges the `message/delivery-status`
 * MIME part's body into `parsed.text` alongside the human-readable part, so
 * the per-recipient fields (Status, Action, Diagnostic-Code, ...) can be
 * pulled out of it with simple line-anchored regexes.
 */
export async function parseDsn(raw: Buffer): Promise<DsnParseResult> {
  const empty: DsnParseResult = {
    isDsn: false,
    bounceClass: null,
    statusCode: null,
    diagnostic: null,
    finalRecipient: null,
    originalMessageId: null,
  };

  const parsed = await simpleParser(raw);
  const contentType = parsed.headers.get('content-type') as
    { value?: string; params?: Record<string, string> } | undefined;
  const declaresDeliveryStatusReport =
    contentType?.value === 'multipart/report' &&
    contentType.params?.['report-type'] === 'delivery-status';

  const text = parsed.text ?? '';
  const statusMatch = STATUS_RE.exec(text);
  const actionMatch = ACTION_RE.exec(text);

  const statusClass =
    statusMatch?.[1] === '5'
      ? 'hard'
      : statusMatch?.[1] === '4'
        ? 'soft'
        : null;
  const bounceClass =
    statusClass ?? classifyFromAction(actionMatch?.[1] ?? null);

  if (!declaresDeliveryStatusReport && !bounceClass) {
    return empty;
  }

  const diagnosticMatch = DIAGNOSTIC_RE.exec(text);
  const finalRecipientMatch = FINAL_RECIPIENT_RE.exec(text);

  let originalMessageId: string | null = null;
  const attachments = Array.isArray(parsed.attachments)
    ? parsed.attachments
    : [];
  for (const attachment of attachments) {
    if (
      attachment.contentType === 'message/rfc822' ||
      attachment.contentType === 'text/rfc822-headers'
    ) {
      const headerText = attachment.content.toString('utf8');
      const match = MESSAGE_ID_HEADER_RE.exec(headerText);
      if (match) {
        originalMessageId = match[1];
        break;
      }
    }
  }

  return {
    isDsn: true,
    bounceClass,
    statusCode: statusMatch
      ? `${statusMatch[1]}.${statusMatch[2]}.${statusMatch[3]}`
      : null,
    diagnostic: diagnosticMatch?.[1]?.trim() ?? null,
    finalRecipient: finalRecipientMatch?.[1]?.trim() ?? null,
    originalMessageId,
  };
}
