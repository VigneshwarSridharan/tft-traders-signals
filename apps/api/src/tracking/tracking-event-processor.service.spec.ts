import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type { Pool, PoolClient } from 'pg';
import { TrackingEventProcessorService } from './tracking-event-processor.service';
import { EmailLinksRepository } from '../database/email-links.repository';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { GeoLookupService } from './geo-lookup.service';
import type { EmailMessageRow } from '../database/rows';
import type { EnvConfig } from '../config/env.validation';
import type { TrackingJobData } from './tracking-queue.service';

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
    queued_at: new Date('2026-07-01T12:00:00Z'),
    sent_at: new Date('2026-07-01T12:00:05Z'),
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

function buildJob(data: TrackingJobData): Job<TrackingJobData> {
  return { data } as unknown as Job<TrackingJobData>;
}

describe('TrackingEventProcessorService', () => {
  let pool: jest.Mocked<Pool>;
  let client: jest.Mocked<PoolClient>;
  let emailMessagesRepository: jest.Mocked<EmailMessagesRepository>;
  let emailLinksRepository: jest.Mocked<EmailLinksRepository>;
  let trackingEventsRepository: jest.Mocked<TrackingEventsRepository>;
  let geoLookupService: jest.Mocked<GeoLookupService>;
  let configService: ConfigService<EnvConfig, true>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let service: TrackingEventProcessorService;

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
      findById: jest.fn().mockResolvedValue(buildMessageRow()),
      recordOpen: jest.fn().mockResolvedValue(undefined),
      recordClick: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailMessagesRepository>;

    emailLinksRepository = {
      recordClick: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<EmailLinksRepository>;

    trackingEventsRepository = {
      insert: jest.fn().mockResolvedValue(undefined),
      countRecentDistinctLinkClicks: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<TrackingEventsRepository>;

    geoLookupService = {
      lookup: jest.fn().mockReturnValue(null),
    } as unknown as jest.Mocked<GeoLookupService>;

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'TRACKING_CLICK_BOT_MIN_SECONDS') return 3;
        return undefined;
      }),
    } as unknown as ConfigService<EnvConfig, true>;

    notificationsService = {
      notify: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationsService>;

    service = new TrackingEventProcessorService(
      pool,
      emailMessagesRepository,
      emailLinksRepository,
      trackingEventsRepository,
      geoLookupService,
      configService,
      notificationsService,
    );
  });

  describe('open events', () => {
    it('records a non-bot open and updates the message counters', async () => {
      await service.processJob(
        buildJob({
          kind: 'open',
          token: 'pub-token',
          ip: '203.0.113.5',
          userAgent: 'Mozilla/5.0 (iPhone) Mobile Safari',
          occurredAt: '2026-07-01T12:00:10.000Z',
        }),
      );

      expect(trackingEventsRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'open', isBot: false }),
        client,
      );
      expect(emailMessagesRepository.recordOpen).toHaveBeenCalledWith(
        'message-1',
        new Date('2026-07-01T12:00:10.000Z'),
        client,
      );
      expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(client.query).toHaveBeenNthCalledWith(2, 'COMMIT');
      expect(client.release).toHaveBeenCalled();
      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', type: 'first_open' }),
      );
    });

    it('does not send a first-open notification for a repeat open', async () => {
      emailMessagesRepository.findByPublicToken.mockResolvedValue(
        buildMessageRow({ open_count: 1 }),
      );

      await service.processJob(
        buildJob({
          kind: 'open',
          token: 'pub-token',
          ip: '203.0.113.5',
          userAgent: 'Mozilla/5.0 (iPhone) Mobile Safari',
          occurredAt: '2026-07-01T12:00:10.000Z',
        }),
      );

      expect(notificationsService.notify).not.toHaveBeenCalled();
    });

    it('flags a known scanner user agent as bot and skips the counter update', async () => {
      await service.processJob(
        buildJob({
          kind: 'open',
          token: 'pub-token',
          ip: '203.0.113.5',
          userAgent: 'Mimecast URL scanner',
          occurredAt: '2026-07-01T12:00:10.000Z',
        }),
      );

      expect(trackingEventsRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'open', isBot: true }),
        client,
      );
      expect(emailMessagesRepository.recordOpen).not.toHaveBeenCalled();
    });

    it('drops the job silently when the public token is unknown', async () => {
      emailMessagesRepository.findByPublicToken.mockResolvedValue(null);

      await service.processJob(
        buildJob({
          kind: 'open',
          token: 'missing',
          ip: null,
          userAgent: null,
          occurredAt: '2026-07-01T12:00:10.000Z',
        }),
      );

      expect(pool.connect).not.toHaveBeenCalled();
      expect(trackingEventsRepository.insert).not.toHaveBeenCalled();
    });
  });

  describe('click events', () => {
    it('records a click, updates message and link counters, and infers an open when none was recorded', async () => {
      await service.processJob(
        buildJob({
          kind: 'click',
          token: 'link-token',
          linkId: 'link-1',
          messageId: 'message-1',
          ip: '203.0.113.5',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
          occurredAt: '2026-07-01T12:05:00.000Z',
        }),
      );

      expect(trackingEventsRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'open_inferred' }),
        client,
      );
      expect(trackingEventsRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'click',
          linkId: 'link-1',
          isBot: false,
        }),
        client,
      );
      expect(emailMessagesRepository.recordOpen).toHaveBeenCalled();
      expect(emailMessagesRepository.recordClick).toHaveBeenCalledWith(
        'message-1',
        new Date('2026-07-01T12:05:00.000Z'),
        client,
      );
      expect(emailLinksRepository.recordClick).toHaveBeenCalledWith(
        'link-1',
        client,
      );
      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', type: 'click' }),
      );
    });

    it('does not infer an open when the message already has one', async () => {
      emailMessagesRepository.findById.mockResolvedValue(
        buildMessageRow({ open_count: 1 }),
      );

      await service.processJob(
        buildJob({
          kind: 'click',
          token: 'link-token',
          linkId: 'link-1',
          messageId: 'message-1',
          ip: '203.0.113.5',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
          occurredAt: '2026-07-01T12:05:00.000Z',
        }),
      );

      expect(trackingEventsRepository.insert).not.toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'open_inferred' }),
        client,
      );
    });

    it('flags a click faster than the bot threshold and skips counter updates', async () => {
      await service.processJob(
        buildJob({
          kind: 'click',
          token: 'link-token',
          linkId: 'link-1',
          messageId: 'message-1',
          ip: '203.0.113.5',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
          occurredAt: '2026-07-01T12:00:06.000Z',
        }),
      );

      expect(trackingEventsRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'click', isBot: true }),
        client,
      );
      expect(emailMessagesRepository.recordClick).not.toHaveBeenCalled();
      expect(emailLinksRepository.recordClick).not.toHaveBeenCalled();
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });

    it('rolls back the transaction if a repository call fails', async () => {
      trackingEventsRepository.insert.mockRejectedValueOnce(
        new Error('db down'),
      );

      await expect(
        service.processJob(
          buildJob({
            kind: 'click',
            token: 'link-token',
            linkId: 'link-1',
            messageId: 'message-1',
            ip: '203.0.113.5',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
            occurredAt: '2026-07-01T12:05:00.000Z',
          }),
        ),
      ).rejects.toThrow('db down');

      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });
  });
});
