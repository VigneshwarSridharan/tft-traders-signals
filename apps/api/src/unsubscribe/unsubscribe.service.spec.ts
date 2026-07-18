import type { Pool, PoolClient } from 'pg';
import { UnsubscribeService } from './unsubscribe.service';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { SuppressionsRepository } from '../database/suppressions.repository';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import type { EmailMessageRow } from '../database/rows';

function buildMessageRow(
  overrides: Partial<EmailMessageRow> = {},
): EmailMessageRow {
  return {
    id: 'message-1',
    public_token: 'pub-token',
    sender_account_id: 'sender-1',
    customer_id: 'customer-1',
    template_version_id: null,
    sent_by: 'user-1',
    to_email: 'jane@acme.com',
    to_name: 'Jane Doe',
    subject: 'Hello Jane',
    body_html_rendered: '<p>Hi</p>',
    body_text_rendered: 'Hi',
    message_id_header: '<abc@test.local>',
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

describe('UnsubscribeService', () => {
  let pool: jest.Mocked<Pool>;
  let client: jest.Mocked<PoolClient>;
  let emailMessagesRepository: jest.Mocked<EmailMessagesRepository>;
  let trackingEventsRepository: jest.Mocked<TrackingEventsRepository>;
  let suppressionsRepository: jest.Mocked<SuppressionsRepository>;
  let auditLogsRepository: jest.Mocked<AuditLogsRepository>;
  let service: UnsubscribeService;

  beforeEach(() => {
    client = {
      query: jest.fn().mockResolvedValue(undefined),
      release: jest.fn(),
    } as unknown as jest.Mocked<PoolClient>;

    pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as jest.Mocked<Pool>;

    emailMessagesRepository = {
      findByPublicToken: jest.fn().mockResolvedValue(buildMessageRow()),
      markUnsubscribed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailMessagesRepository>;

    trackingEventsRepository = {
      insert: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TrackingEventsRepository>;

    suppressionsRepository = {
      upsert: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SuppressionsRepository>;

    auditLogsRepository = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogsRepository>;

    service = new UnsubscribeService(
      pool,
      emailMessagesRepository,
      trackingEventsRepository,
      suppressionsRepository,
      auditLogsRepository,
    );
  });

  it('returns null for an unknown token without touching the database', async () => {
    emailMessagesRepository.findByPublicToken.mockResolvedValue(null);

    const result = await service.unsubscribe('missing', '1.2.3.4', 'UA');

    expect(result).toBeNull();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('records an unsubscribe event, marks the message, suppresses the address, and audit-logs it', async () => {
    const result = await service.unsubscribe('pub-token', '1.2.3.4', 'UA');

    expect(result).toEqual({ email: 'jane@acme.com' });

    expect(trackingEventsRepository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'message-1',
        eventType: 'unsubscribe',
        ip: '1.2.3.4',
        userAgent: 'UA',
      }),
      client,
    );
    expect(emailMessagesRepository.markUnsubscribed).toHaveBeenCalledWith(
      'message-1',
      expect.any(Date),
      client,
    );
    expect(suppressionsRepository.upsert).toHaveBeenCalledWith(
      {
        email: 'jane@acme.com',
        customerId: 'customer-1',
        reason: 'unsubscribe',
        sourceMessageId: 'message-1',
      },
      client,
    );
    expect(auditLogsRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        action: 'unsubscribe.recorded',
        entityType: 'email_message',
        entityId: 'message-1',
      }),
      client,
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  it('is idempotent for a message whose customer has already been erased', async () => {
    emailMessagesRepository.findByPublicToken.mockResolvedValue(
      buildMessageRow({ customer_id: null }),
    );

    const result = await service.unsubscribe('pub-token', null, null);

    expect(result).toEqual({ email: 'jane@acme.com' });
    expect(suppressionsRepository.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: null }),
      client,
    );
  });
});
