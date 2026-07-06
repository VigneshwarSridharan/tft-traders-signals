import { parseDsn } from './dsn-parser.util';

function buildDsn(params: {
  status: string;
  action: string;
  diagnostic: string;
  finalRecipient: string;
  originalMessageId: string;
}): Buffer {
  return Buffer.from(
    `From: Mail Delivery Subsystem <MAILER-DAEMON@mx.example.com>
To: sales@company.com
Subject: Undelivered Mail Returned to Sender
Message-ID: <bounce123@mx.example.com>
Content-Type: multipart/report; report-type=delivery-status;
\tboundary="BOUNDARY1"
MIME-Version: 1.0

--BOUNDARY1
Content-Type: text/plain; charset=us-ascii

This is the mail system.

--BOUNDARY1
Content-Type: message/delivery-status

Reporting-MTA: dns; mx.example.com
Arrival-Date: Mon, 6 Jul 2026 10:00:00 +0000

Final-Recipient: rfc822; ${params.finalRecipient}
Action: ${params.action}
Status: ${params.status}
Diagnostic-Code: smtp; ${params.diagnostic}

--BOUNDARY1
Content-Type: message/rfc822

From: "Sales" <sales@company.com>
To: ${params.finalRecipient}
Subject: Your quotation
Message-ID: ${params.originalMessageId}
Date: Mon, 6 Jul 2026 09:59:00 +0000
Content-Type: text/html

<html><body>Hi</body></html>

--BOUNDARY1--
`,
  );
}

describe('parseDsn', () => {
  it('classifies a 5.x.x status as a hard bounce and extracts the original Message-ID', async () => {
    const result = await parseDsn(
      buildDsn({
        status: '5.1.1',
        action: 'failed',
        diagnostic:
          '550-5.1.1 The email account that you tried to reach does not exist.',
        finalRecipient: 'nonexistent@gmail.com',
        originalMessageId: '<original-msg-uuid@tft-traders-signals.local>',
      }),
    );

    expect(result.isDsn).toBe(true);
    expect(result.bounceClass).toBe('hard');
    expect(result.statusCode).toBe('5.1.1');
    expect(result.finalRecipient).toBe('nonexistent@gmail.com');
    expect(result.originalMessageId).toBe(
      '<original-msg-uuid@tft-traders-signals.local>',
    );
    expect(result.diagnostic).toContain('does not exist');
  });

  it('classifies a 4.x.x status as a soft bounce', async () => {
    const result = await parseDsn(
      buildDsn({
        status: '4.2.2',
        action: 'delayed',
        diagnostic: '452 4.2.2 mailbox full',
        finalRecipient: 'full@example.com',
        originalMessageId: '<msg-2@tft-traders-signals.local>',
      }),
    );

    expect(result.isDsn).toBe(true);
    expect(result.bounceClass).toBe('soft');
    expect(result.statusCode).toBe('4.2.2');
  });

  it('is not a DSN for a normal reply email', async () => {
    const raw = Buffer.from(
      `From: jane@acme.com
To: sales@company.com
Subject: Re: Your quotation
Message-ID: <reply-1@acme.com>
In-Reply-To: <original-msg-uuid@tft-traders-signals.local>
Content-Type: text/plain

Thanks, looks good!
`,
    );
    const result = await parseDsn(raw);
    expect(result.isDsn).toBe(false);
    expect(result.bounceClass).toBeNull();
  });
});
