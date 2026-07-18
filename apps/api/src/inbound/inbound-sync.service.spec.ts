import { ConfigService } from '@nestjs/config';
import type { Pool, PoolClient } from 'pg';
import type { FetchMessageObject } from 'imapflow';
import { InboundSyncService } from './inbound-sync.service';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { InboundRepository } from '../database/inbound.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import { SuppressionsRepository } from '../database/suppressions.repository';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import type { EmailMessageRow, SenderAccountRow } from '../database/rows';
import type { EnvConfig } from '../config/env.validation';
import { NotificationsService } from '../notifications/notifications.service';

function buildDsnSource(params: {
  status: string;
  action: string;
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

Final-Recipient: rfc822; nonexistent@gmail.com
Action: ${params.action}
Status: ${params.status}
Diagnostic-Code: smtp; 550 5.1.1 no such user

--BOUNDARY1
Content-Type: message/rfc822

From: "Sales" <sales@company.com>
To: nonexistent@gmail.com
Subject: Your quotation
Message-ID: ${params.originalMessageId}
Date: Mon, 6 Jul 2026 09:59:00 +0000
Content-Type: text/html

<html><body>Hi</body></html>

--BOUNDARY1--
`,
  );
}

const NON_BOUNCE_SOURCE = Buffer.from(
  `From: jane@acme.com
To: sales@company.com
Subject: Re: Your quotation
Message-ID: <reply-1@acme.com>
Content-Type: text/plain

Thanks!
`,
);

const REPLY_VIA_IN_REPLY_TO_SOURCE = Buffer.from(
  `From: jane@acme.com
To: sales@company.com
Subject: Re: Your quotation
Message-ID: <reply-2@acme.com>
In-Reply-To: <original-msg-uuid@tft-traders-signals.local>
Content-Type: text/plain

Sounds good, let's proceed.
`,
);

const REPLY_VIA_REFERENCES_SOURCE = Buffer.from(
  `From: jane@acme.com
To: sales@company.com
Subject: Re: Your quotation
Message-ID: <reply-3@acme.com>
References: <some-other-thread@acme.com> <original-msg-uuid@tft-traders-signals.local>
Content-Type: text/plain

Following up on this thread.
`,
);

const UNMATCHED_REPLY_SOURCE = Buffer.from(
  `From: jane@acme.com
To: sales@company.com
Subject: Re: Something else
Message-ID: <reply-4@acme.com>
In-Reply-To: <unknown-original@tft-traders-signals.local>
Content-Type: text/plain

Following up.
`,
);

function buildSenderAccount(
  overrides: Partial<SenderAccountRow> = {},
): SenderAccountRow {
  return {
    id: 'sender-1',
    email: 'sales@company.com',
    display_name: 'Sales',
    smtp_host: 'smtp.zoho.com',
    smtp_port: 465,
    imap_host: 'imap.zoho.com',
    imap_port: 993,
    credential_enc: Buffer.from('enc'),
    signature_html: null,
    daily_quota: null,
    hourly_quota: null,
    status: 'active',
    last_verified_at: null,
    imap_last_uid: '10',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildEmailMessage(
  overrides: Partial<EmailMessageRow> = {},
): EmailMessageRow {
  return {
    id: 'message-1',
    public_token: 'pub-token',
    sender_account_id: 'sender-1',
    customer_id: 'customer-1',
    template_version_id: null,
    sent_by: 'user-1',
    to_email: 'nonexistent@gmail.com',
    to_name: null,
    subject: 'Your quotation',
    body_html_rendered: '<p>Hi</p>',
    body_text_rendered: null,
    message_id_header: '<original-msg-uuid@tft-traders-signals.local>',
    tracking_enabled: true,
    status: 'sent',
    smtp_response: '250 OK',
    queued_at: new Date(),
    sent_at: new Date(),
    open_count: 0,
    unique_open_hint: false,
    first_opened_at: null,
    last_opened_at: null,
    click_count: 0,
    first_clicked_at: null,
    last_clicked_at: null,
    replied_at: null,
    bounce_type: 'none',
    unsubscribed_at: null,
    parent_message_id: null,
    in_reply_to_header: null,
    references_header: null,
    follow_up_days: null,
    follow_up_notified_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildFetchMessage(
  source: Buffer,
  overrides: Partial<FetchMessageObject> = {},
): FetchMessageObject {
  return {
    seq: 1,
    uid: 11,
    source,
    envelope: {
      date: new Date('2026-07-06T10:00:00Z'),
      subject: 'Undelivered Mail Returned to Sender',
      messageId: '<bounce123@mx.example.com>',
      from: [{ address: 'mailer-daemon@mx.example.com' }],
      to: [{ address: 'sales@company.com' }],
    },
    ...overrides,
  };
}

describe('InboundSyncService.processMessage', () => {
  let pool: jest.Mocked<Pool>;
  let client: jest.Mocked<PoolClient>;
  let senderAccountsRepository: jest.Mocked<SenderAccountsRepository>;
  let inboundRepository: jest.Mocked<InboundRepository>;
  let emailMessagesRepository: jest.Mocked<EmailMessagesRepository>;
  let suppressionsRepository: jest.Mocked<SuppressionsRepository>;
  let trackingEventsRepository: jest.Mocked<TrackingEventsRepository>;
  let configService: ConfigService<EnvConfig, true>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let service: InboundSyncService;

  beforeEach(() => {
    client = {
      query: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;

    pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as jest.Mocked<Pool>;

    senderAccountsRepository =
      {} as unknown as jest.Mocked<SenderAccountsRepository>;

    inboundRepository = {
      createInboundMessage: jest.fn().mockResolvedValue({ id: 'inbound-1' }),
      upsertBounce: jest.fn().mockResolvedValue(undefined),
      countRecentSoftBounces: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<InboundRepository>;

    emailMessagesRepository = {
      findByMessageIdHeader: jest.fn().mockResolvedValue(buildEmailMessage()),
      markBounced: jest.fn().mockResolvedValue(undefined),
      markReplied: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailMessagesRepository>;

    suppressionsRepository = {
      upsert: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SuppressionsRepository>;

    trackingEventsRepository = {
      insert: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TrackingEventsRepository>;

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'SOFT_BOUNCE_SUPPRESSION_THRESHOLD') return 3;
        if (key === 'SOFT_BOUNCE_SUPPRESSION_WINDOW_DAYS') return 30;
        return undefined;
      }),
    } as unknown as ConfigService<EnvConfig, true>;

    notificationsService = {
      notify: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationsService>;

    service = new InboundSyncService(
      pool,
      senderAccountsRepository,
      inboundRepository,
      emailMessagesRepository,
      suppressionsRepository,
      trackingEventsRepository,
      configService,
      notificationsService,
    );
  });

  it('immediately suppresses on a hard bounce and marks the message bounced', async () => {
    const message = buildFetchMessage(
      buildDsnSource({
        status: '5.1.1',
        action: 'failed',
        originalMessageId: '<original-msg-uuid@tft-traders-signals.local>',
      }),
    );

    await service.processMessage(buildSenderAccount(), message);

    expect(emailMessagesRepository.markBounced).toHaveBeenCalledWith(
      'message-1',
      'hard',
      expect.any(Date),
      client,
    );
    expect(inboundRepository.upsertBounce).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'message-1', bounceClass: 'hard' }),
      client,
    );
    expect(suppressionsRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'nonexistent@gmail.com',
        reason: 'hard_bounce',
      }),
      client,
    );
    expect(notificationsService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'bounce',
        messageId: 'message-1',
      }),
    );
  });

  it('does not suppress a lone soft bounce below the repeat threshold', async () => {
    inboundRepository.countRecentSoftBounces.mockResolvedValue(1);
    const message = buildFetchMessage(
      buildDsnSource({
        status: '4.2.2',
        action: 'delayed',
        originalMessageId: '<original-msg-uuid@tft-traders-signals.local>',
      }),
    );

    await service.processMessage(buildSenderAccount(), message);

    expect(emailMessagesRepository.markBounced).toHaveBeenCalledWith(
      'message-1',
      'soft',
      expect.any(Date),
      client,
    );
    expect(suppressionsRepository.upsert).not.toHaveBeenCalled();
  });

  it('suppresses once repeated soft bounces cross the configured threshold', async () => {
    inboundRepository.countRecentSoftBounces.mockResolvedValue(3);
    const message = buildFetchMessage(
      buildDsnSource({
        status: '4.2.2',
        action: 'delayed',
        originalMessageId: '<original-msg-uuid@tft-traders-signals.local>',
      }),
    );

    await service.processMessage(buildSenderAccount(), message);

    expect(suppressionsRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'soft_bounce_repeat' }),
      client,
    );
  });

  it('is idempotent: skips all bounce processing when the UID was already synced', async () => {
    inboundRepository.createInboundMessage.mockResolvedValue(null);
    const message = buildFetchMessage(
      buildDsnSource({
        status: '5.1.1',
        action: 'failed',
        originalMessageId: '<original-msg-uuid@tft-traders-signals.local>',
      }),
    );

    await service.processMessage(buildSenderAccount(), message);

    expect(emailMessagesRepository.markBounced).not.toHaveBeenCalled();
    expect(inboundRepository.upsertBounce).not.toHaveBeenCalled();
    expect(suppressionsRepository.upsert).not.toHaveBeenCalled();
  });

  it('records an unmatched bounce without touching any email_messages row', async () => {
    emailMessagesRepository.findByMessageIdHeader.mockResolvedValue(null);
    const message = buildFetchMessage(
      buildDsnSource({
        status: '5.1.1',
        action: 'failed',
        originalMessageId: '<unknown@tft-traders-signals.local>',
      }),
    );

    await service.processMessage(buildSenderAccount(), message);

    expect(inboundRepository.createInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        classification: 'bounce_dsn',
        matchedMessageId: null,
      }),
      client,
    );
    expect(emailMessagesRepository.markBounced).not.toHaveBeenCalled();
    expect(suppressionsRepository.upsert).not.toHaveBeenCalled();
  });

  it('classifies a non-DSN message as other and does not touch bounce state', async () => {
    const message = buildFetchMessage(NON_BOUNCE_SOURCE, { uid: 12 });

    await service.processMessage(buildSenderAccount(), message);

    expect(inboundRepository.createInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ classification: 'other' }),
      client,
    );
    expect(emailMessagesRepository.markBounced).not.toHaveBeenCalled();
    expect(suppressionsRepository.upsert).not.toHaveBeenCalled();
  });

  it('correlates a reply via In-Reply-To and marks the message replied', async () => {
    const message = buildFetchMessage(REPLY_VIA_IN_REPLY_TO_SOURCE, {
      uid: 13,
    });

    await service.processMessage(buildSenderAccount(), message);

    expect(inboundRepository.createInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        classification: 'reply',
        matchedMessageId: 'message-1',
        inReplyTo: '<original-msg-uuid@tft-traders-signals.local>',
      }),
      client,
    );
    expect(trackingEventsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'message-1', eventType: 'reply' }),
      client,
    );
    expect(emailMessagesRepository.markReplied).toHaveBeenCalledWith(
      'message-1',
      expect.any(Date),
      client,
    );
    expect(emailMessagesRepository.markBounced).not.toHaveBeenCalled();
    expect(suppressionsRepository.upsert).not.toHaveBeenCalled();
    expect(notificationsService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'reply',
        messageId: 'message-1',
      }),
    );
  });

  it('falls back to References when In-Reply-To is absent', async () => {
    const message = buildFetchMessage(REPLY_VIA_REFERENCES_SOURCE, {
      uid: 14,
    });

    await service.processMessage(buildSenderAccount(), message);

    expect(inboundRepository.createInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        classification: 'reply',
        matchedMessageId: 'message-1',
      }),
      client,
    );
    expect(trackingEventsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'message-1', eventType: 'reply' }),
      client,
    );
    expect(emailMessagesRepository.markReplied).toHaveBeenCalled();
  });

  it('classifies an unmatched reply-shaped message as other', async () => {
    emailMessagesRepository.findByMessageIdHeader.mockResolvedValue(null);
    const message = buildFetchMessage(UNMATCHED_REPLY_SOURCE, { uid: 15 });

    await service.processMessage(buildSenderAccount(), message);

    expect(inboundRepository.createInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        classification: 'other',
        matchedMessageId: null,
      }),
      client,
    );
    expect(trackingEventsRepository.insert).not.toHaveBeenCalled();
    expect(emailMessagesRepository.markReplied).not.toHaveBeenCalled();
  });

  it('does not double-count a second reply on an already-replied thread', async () => {
    emailMessagesRepository.findByMessageIdHeader.mockResolvedValue(
      buildEmailMessage({ replied_at: new Date('2026-07-10T00:00:00Z') }),
    );
    const message = buildFetchMessage(REPLY_VIA_IN_REPLY_TO_SOURCE, {
      uid: 16,
    });

    await service.processMessage(buildSenderAccount(), message);

    // Still recorded in the inbound audit trail as a reply...
    expect(inboundRepository.createInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({ classification: 'reply' }),
      client,
    );
    // ...but no second tracking event or replied_at overwrite.
    expect(trackingEventsRepository.insert).not.toHaveBeenCalled();
    expect(emailMessagesRepository.markReplied).not.toHaveBeenCalled();
    expect(notificationsService.notify).not.toHaveBeenCalled();
  });

  it('a DSN message never runs reply correlation even if reply-shaped headers are present', async () => {
    const message = buildFetchMessage(
      buildDsnSource({
        status: '5.1.1',
        action: 'failed',
        originalMessageId: '<original-msg-uuid@tft-traders-signals.local>',
      }),
    );

    await service.processMessage(buildSenderAccount(), message);

    expect(trackingEventsRepository.insert).not.toHaveBeenCalled();
    expect(emailMessagesRepository.markReplied).not.toHaveBeenCalled();
  });
});
