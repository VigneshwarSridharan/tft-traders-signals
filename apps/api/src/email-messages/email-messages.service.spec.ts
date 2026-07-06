import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailMessagesService } from './email-messages.service';
import { EmailLinksRepository } from '../database/email-links.repository';
import type { EmailMessageListRow } from '../database/email-messages.repository';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { InboundRepository } from '../database/inbound.repository';
import { SavedMessageFiltersRepository } from '../database/saved-message-filters.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import { TagsRepository } from '../database/tags.repository';
import { TemplatesRepository } from '../database/templates.repository';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import { CustomersRepository } from '../database/customers.repository';
import { CustomFieldDefsRepository } from '../database/custom-field-defs.repository';
import { EmailSenderService } from '../send/email-sender.service';
import { SendQueueService } from '../send/send-queue.service';
import type {
  CustomerRow,
  EmailMessageRow,
  SenderAccountRow,
} from '../database/rows';
import type { EnvConfig } from '../config/env.validation';

function buildMessageListRow(
  overrides: Partial<EmailMessageListRow> = {},
): EmailMessageListRow {
  return {
    ...buildMessageRow(),
    sender_account_email: 'sales@company.com',
    sender_account_display_name: 'Sales Team',
    template_id: null,
    template_name: null,
    ...overrides,
  };
}

function buildSenderAccountRow(
  overrides: Partial<SenderAccountRow> = {},
): SenderAccountRow {
  return {
    id: 'sender-1',
    email: 'sales@company.com',
    display_name: 'Sales Team',
    smtp_host: 'smtp.zoho.com',
    smtp_port: 465,
    imap_host: 'imap.zoho.com',
    imap_port: 993,
    credential_enc: Buffer.from('enc'),
    signature_html: 'Best,<br/>Sales',
    daily_quota: null,
    hourly_quota: null,
    status: 'active',
    last_verified_at: null,
    imap_last_uid: '0',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildCustomerRow(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: 'customer-1',
    name: 'Jane Doe',
    company: 'Acme Corp',
    email: 'jane@acme.com',
    phone: null,
    notes: null,
    tracking_opt_out: false,
    engagement_score: 0,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildMessageRow(
  overrides: Partial<EmailMessageRow> = {},
): EmailMessageRow {
  return {
    id: 'message-1',
    public_token: 'token',
    sender_account_id: 'sender-1',
    customer_id: 'customer-1',
    template_version_id: null,
    sent_by: 'user-1',
    to_email: 'jane@acme.com',
    to_name: 'Jane Doe',
    subject: 'Hello Jane',
    body_html_rendered: '<p>Hello Jane</p>',
    body_text_rendered: 'Hello Jane',
    message_id_header: '<abc@test.local>',
    tracking_enabled: true,
    status: 'queued',
    smtp_response: null,
    queued_at: new Date(),
    sent_at: null,
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
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('EmailMessagesService', () => {
  let service: EmailMessagesService;
  let emailMessagesRepository: jest.Mocked<EmailMessagesRepository>;
  let emailLinksRepository: jest.Mocked<EmailLinksRepository>;
  let senderAccountsRepository: jest.Mocked<SenderAccountsRepository>;
  let customersRepository: jest.Mocked<CustomersRepository>;
  let customFieldDefsRepository: jest.Mocked<CustomFieldDefsRepository>;
  let templatesRepository: jest.Mocked<TemplatesRepository>;
  let sendQueueService: jest.Mocked<SendQueueService>;
  let configService: ConfigService<EnvConfig, true>;
  let emailSenderService: jest.Mocked<EmailSenderService>;
  let trackingEventsRepository: jest.Mocked<TrackingEventsRepository>;
  let inboundRepository: jest.Mocked<InboundRepository>;
  let tagsRepository: jest.Mocked<TagsRepository>;
  let savedMessageFiltersRepository: jest.Mocked<SavedMessageFiltersRepository>;

  beforeEach(() => {
    emailMessagesRepository = {
      create: jest.fn().mockResolvedValue(buildMessageRow()),
      createAttachment: jest.fn(),
      findById: jest.fn(),
      findDetailById: jest.fn().mockResolvedValue(buildMessageListRow()),
      list: jest.fn().mockResolvedValue({ rows: [], total: 0 }),
      getAttachments: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EmailMessagesRepository>;

    emailLinksRepository = {
      create: jest.fn().mockResolvedValue(undefined),
      listForMessage: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EmailLinksRepository>;

    senderAccountsRepository = {
      findById: jest.fn().mockResolvedValue(buildSenderAccountRow()),
      getUsage: jest.fn().mockResolvedValue({ dailyUsed: 0, hourlyUsed: 0 }),
    } as unknown as jest.Mocked<SenderAccountsRepository>;

    customersRepository = {
      findById: jest.fn().mockResolvedValue(buildCustomerRow()),
      getFieldValuesForCustomers: jest.fn().mockResolvedValue(new Map()),
      getSuppressionFlags: jest.fn().mockResolvedValue(new Map()),
      getFieldValues: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<CustomersRepository>;

    customFieldDefsRepository = {
      list: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<CustomFieldDefsRepository>;

    templatesRepository = {
      findVersionById: jest.fn(),
    } as unknown as jest.Mocked<TemplatesRepository>;

    sendQueueService = {
      enqueueSend: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SendQueueService>;

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'ATTACHMENT_STORAGE_PATH')
          return '/tmp/tft-test-attachments';
        if (key === 'SEND_FROM_DOMAIN') return 'test.local';
        if (key === 'TRACKING_DOMAIN') return 'track.test.local';
        return undefined;
      }),
    } as unknown as ConfigService<EnvConfig, true>;

    emailSenderService = {
      sendNow: jest.fn().mockResolvedValue('250 OK'),
    } as unknown as jest.Mocked<EmailSenderService>;

    trackingEventsRepository = {
      listForMessage: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TrackingEventsRepository>;

    inboundRepository = {
      findBounceByMessageId: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<InboundRepository>;

    tagsRepository = {
      listForEntity: jest.fn().mockResolvedValue([]),
      listForEntities: jest.fn().mockResolvedValue(new Map()),
      findById: jest.fn(),
      addTagging: jest.fn().mockResolvedValue(undefined),
      removeTagging: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TagsRepository>;

    savedMessageFiltersRepository = {
      listForUser: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SavedMessageFiltersRepository>;

    service = new EmailMessagesService(
      emailMessagesRepository,
      emailLinksRepository,
      senderAccountsRepository,
      customersRepository,
      customFieldDefsRepository,
      templatesRepository,
      sendQueueService,
      configService,
      emailSenderService,
      trackingEventsRepository,
      inboundRepository,
      tagsRepository,
      savedMessageFiltersRepository,
    );
  });

  it('rejects an unknown sender account', async () => {
    senderAccountsRepository.findById.mockResolvedValue(null);

    await expect(
      service.compose(
        {
          senderAccountId: 'missing',
          customerIds: ['customer-1'],
          subject: 'Hi',
          bodyHtml: '<p>Hi</p>',
        },
        [],
        'user-1',
        'admin',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('composes and enqueues a message per recipient', async () => {
    const response = await service.compose(
      {
        senderAccountId: 'sender-1',
        customerIds: ['customer-1'],
        subject: 'Hello {{customer.name}}',
        bodyHtml: '<p>Hi {{customer.name}}, from {{sender.name}}</p>',
      },
      [],
      'user-1',
      'admin',
    );

    expect(response.results).toEqual([
      {
        customerId: 'customer-1',
        ok: true,
        messageId: 'message-1',
        error: null,
      },
    ]);
    expect(emailMessagesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'jane@acme.com',
        status: 'queued',
      }),
    );
    expect(sendQueueService.enqueueSend).toHaveBeenCalledWith('message-1');
  });

  it('fails a recipient with unresolved merge fields instead of the whole batch', async () => {
    const response = await service.compose(
      {
        senderAccountId: 'sender-1',
        customerIds: ['customer-1'],
        subject: 'Quote {{quotation.number}}',
        bodyHtml: '<p>{{quotation.number}}</p>',
      },
      [],
      'user-1',
      'admin',
    );

    expect(response.results[0].ok).toBe(false);
    expect(response.results[0].error).toContain('quotation.number');
    expect(emailMessagesRepository.create).not.toHaveBeenCalled();
  });

  it('blocks a suppressed customer unless an admin overrides it', async () => {
    customersRepository.getSuppressionFlags.mockResolvedValue(
      new Map([
        [
          'jane@acme.com',
          { email: 'jane@acme.com', suppressed: true, unsubscribed: false },
        ],
      ]),
    );

    const blocked = await service.compose(
      {
        senderAccountId: 'sender-1',
        customerIds: ['customer-1'],
        subject: 'Hi',
        bodyHtml: '<p>Hi</p>',
      },
      [],
      'user-1',
      'admin',
    );
    expect(blocked.results[0].ok).toBe(false);
    expect(blocked.results[0].error).toContain('suppressed');

    const overridden = await service.compose(
      {
        senderAccountId: 'sender-1',
        customerIds: ['customer-1'],
        subject: 'Hi',
        bodyHtml: '<p>Hi</p>',
        overrideSuppression: true,
      },
      [],
      'user-1',
      'admin',
    );
    expect(overridden.results[0].ok).toBe(true);
  });

  it('does not allow a non-admin to override suppression', async () => {
    customersRepository.getSuppressionFlags.mockResolvedValue(
      new Map([
        [
          'jane@acme.com',
          { email: 'jane@acme.com', suppressed: true, unsubscribed: true },
        ],
      ]),
    );

    const response = await service.compose(
      {
        senderAccountId: 'sender-1',
        customerIds: ['customer-1'],
        subject: 'Hi',
        bodyHtml: '<p>Hi</p>',
        overrideSuppression: true,
      },
      [],
      'user-1',
      'agent',
    );

    expect(response.results[0].ok).toBe(false);
    expect(response.results[0].error).toContain('unsubscribed');
  });

  it('injects a tracking pixel and rewrites links when tracking is enabled', async () => {
    await service.compose(
      {
        senderAccountId: 'sender-1',
        customerIds: ['customer-1'],
        subject: 'Hi',
        bodyHtml: '<p>Hi <a href="https://example.com/quote">view</a></p>',
      },
      [],
      'user-1',
      'admin',
    );

    const createCall = emailMessagesRepository.create.mock.calls[0][0];
    expect(createCall.trackingEnabled).toBe(true);
    expect(createCall.bodyHtmlRendered).toContain(
      'https://track.test.local/o/',
    );
    expect(emailLinksRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'message-1',
        originalUrl: 'https://example.com/quote',
      }),
    );
  });

  it('does not inject tracking or persist links when tracking is disabled for the send', async () => {
    await service.compose(
      {
        senderAccountId: 'sender-1',
        customerIds: ['customer-1'],
        subject: 'Hi',
        bodyHtml: '<p>Hi <a href="https://example.com/quote">view</a></p>',
        trackingEnabled: false,
      },
      [],
      'user-1',
      'admin',
    );

    expect(emailMessagesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        bodyHtmlRendered:
          '<p>Hi <a href="https://example.com/quote">view</a></p>',
        trackingEnabled: false,
      }),
    );
    expect(emailLinksRepository.create).not.toHaveBeenCalled();
  });

  it('forces tracking off for a customer with tracking opt-out', async () => {
    customersRepository.findById.mockResolvedValue(
      buildCustomerRow({ tracking_opt_out: true }),
    );

    await service.compose(
      {
        senderAccountId: 'sender-1',
        customerIds: ['customer-1'],
        subject: 'Hi',
        bodyHtml: '<p>Hi</p>',
        trackingEnabled: true,
      },
      [],
      'user-1',
      'admin',
    );

    expect(emailMessagesRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ trackingEnabled: false }),
    );
  });

  it('rejects sending from an inactive sender account', async () => {
    senderAccountsRepository.findById.mockResolvedValue(
      buildSenderAccountRow({ status: 'auth_failed' }),
    );

    await expect(
      service.compose(
        {
          senderAccountId: 'sender-1',
          customerIds: ['customer-1'],
          subject: 'Hi',
          bodyHtml: '<p>Hi</p>',
        },
        [],
        'user-1',
        'admin',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects attachments over the 25 MB total limit', async () => {
    const bigFile = {
      originalname: 'big.bin',
      mimetype: 'application/octet-stream',
      size: 26 * 1024 * 1024,
      buffer: Buffer.alloc(0),
    } as Express.Multer.File;

    await expect(
      service.compose(
        {
          senderAccountId: 'sender-1',
          customerIds: ['customer-1'],
          subject: 'Hi',
          bodyHtml: '<p>Hi</p>',
        },
        [bigFile],
        'user-1',
        'admin',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('testSend', () => {
    it('renders sample data and sends to the given address when no customer is picked', async () => {
      const result = await service.testSend(
        {
          senderAccountId: 'sender-1',
          subject: 'Hi {{customer.name}}',
          bodyHtml: '<p>From {{sender.name}}</p>',
        },
        'me@company.com',
      );

      expect(result).toEqual({
        accepted: true,
        to: 'me@company.com',
        smtpResponse: '250 OK',
        unresolvedPlaceholders: [],
      });
      expect(emailSenderService.sendNow).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'me@company.com',
          subject: '[TEST] Hi Sample Customer',
        }),
      );
    });

    it('personalizes with the selected customer when provided', async () => {
      await service.testSend(
        {
          senderAccountId: 'sender-1',
          subject: 'Hi {{customer.name}}',
          bodyHtml: '<p>Hi</p>',
          customerId: 'customer-1',
        },
        'me@company.com',
      );

      expect(emailSenderService.sendNow).toHaveBeenCalledWith(
        expect.objectContaining({ subject: '[TEST] Hi Jane Doe' }),
      );
    });

    it('reports unresolved placeholders instead of failing', async () => {
      const result = await service.testSend(
        {
          senderAccountId: 'sender-1',
          subject: 'Quote {{quotation.custom_key}}',
          bodyHtml: '<p>Hi</p>',
        },
        'me@company.com',
      );

      expect(result.unresolvedPlaceholders).toEqual(['quotation.custom_key']);
      expect(emailSenderService.sendNow).toHaveBeenCalled();
    });

    it('rejects an unknown sender account', async () => {
      senderAccountsRepository.findById.mockResolvedValue(null);

      await expect(
        service.testSend(
          {
            senderAccountId: 'missing',
            subject: 'Hi',
            bodyHtml: '<p>Hi</p>',
          },
          'me@company.com',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(emailSenderService.sendNow).not.toHaveBeenCalled();
    });

    it('turns an SMTP failure into a BadRequestException with the underlying message', async () => {
      emailSenderService.sendNow.mockRejectedValue(
        new Error('Connection timeout'),
      );

      await expect(
        service.testSend(
          {
            senderAccountId: 'sender-1',
            subject: 'Hi',
            bodyHtml: '<p>Hi</p>',
          },
          'me@company.com',
        ),
      ).rejects.toThrow('Failed to send test email: Connection timeout');
    });
  });

  describe('list', () => {
    it('maps rows and tags into a paginated response', async () => {
      emailMessagesRepository.list.mockResolvedValue({
        rows: [buildMessageListRow({ id: 'message-1' })],
        total: 1,
      });
      tagsRepository.listForEntities.mockResolvedValue(
        new Map([
          [
            'message-1',
            [
              {
                id: 'tag-1',
                name: 'VIP',
                color: null,
                created_at: new Date(),
                updated_at: new Date(),
              },
            ],
          ],
        ]),
      );

      const result = await service.list({
        sort: 'sentAt',
        sortDir: 'desc',
        page: 1,
        pageSize: 25,
      });

      expect(result).toEqual({
        items: [
          expect.objectContaining({
            id: 'message-1',
            tags: [{ id: 'tag-1', name: 'VIP', color: null }],
          }),
        ],
        total: 1,
        page: 1,
        pageSize: 25,
      });
      expect(tagsRepository.listForEntities).toHaveBeenCalledWith('message', [
        'message-1',
      ]);
    });
  });

  describe('getDetail', () => {
    it('throws NotFoundException for an unknown message', async () => {
      emailMessagesRepository.findDetailById.mockResolvedValue(null);

      await expect(service.getDetail('missing')).rejects.toThrow(
        'Message not found',
      );
    });

    it('includes the bounce diagnostic and tags', async () => {
      emailMessagesRepository.findDetailById.mockResolvedValue(
        buildMessageListRow({ bounce_type: 'hard' }),
      );
      inboundRepository.findBounceByMessageId.mockResolvedValue({
        id: 'bounce-1',
        message_id: 'message-1',
        inbound_message_id: 'inbound-1',
        bounce_class: 'hard',
        status_code: '5.1.1',
        diagnostic: 'mailbox unavailable',
        bounced_at: new Date('2026-01-01T00:00:00Z'),
        created_at: new Date(),
        updated_at: new Date(),
      });
      tagsRepository.listForEntity.mockResolvedValue([
        {
          id: 'tag-1',
          name: 'VIP',
          color: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const detail = await service.getDetail('message-1');

      expect(detail.bounceType).toBe('hard');
      expect(detail.bounce).toEqual(
        expect.objectContaining({
          bounceClass: 'hard',
          statusCode: '5.1.1',
          diagnostic: 'mailbox unavailable',
        }),
      );
      expect(detail.tags).toEqual([{ id: 'tag-1', name: 'VIP', color: null }]);
    });
  });

  describe('getTimeline', () => {
    it('excludes bot events by default and includes them when asked', async () => {
      await service.getTimeline('message-1', false);
      expect(trackingEventsRepository.listForMessage).toHaveBeenCalledWith(
        'message-1',
        { includeBotEvents: false },
      );

      await service.getTimeline('message-1', true);
      expect(trackingEventsRepository.listForMessage).toHaveBeenCalledWith(
        'message-1',
        { includeBotEvents: true },
      );
    });

    it('throws NotFoundException for an unknown message', async () => {
      emailMessagesRepository.findDetailById.mockResolvedValue(null);
      await expect(service.getTimeline('missing', false)).rejects.toThrow(
        'Message not found',
      );
    });
  });

  describe('tags', () => {
    it('rejects assigning an unknown tag', async () => {
      tagsRepository.findById.mockResolvedValue(null);
      await expect(service.addTag('message-1', 'missing-tag')).rejects.toThrow(
        'Tag missing-tag not found',
      );
    });

    it('adds and removes a message tag', async () => {
      tagsRepository.findById.mockResolvedValue({
        id: 'tag-1',
        name: 'VIP',
        color: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      await service.addTag('message-1', 'tag-1');
      expect(tagsRepository.addTagging).toHaveBeenCalledWith(
        'tag-1',
        'message',
        'message-1',
      );

      await service.removeTag('message-1', 'tag-1');
      expect(tagsRepository.removeTagging).toHaveBeenCalledWith(
        'tag-1',
        'message',
        'message-1',
      );
    });
  });

  describe('saved filters', () => {
    it('creates and lists saved filters scoped to the user', async () => {
      savedMessageFiltersRepository.create.mockResolvedValue({
        id: 'filter-1',
        user_id: 'user-1',
        name: 'My filter',
        filter: { status: 'bounced' },
        created_at: new Date(),
        updated_at: new Date(),
      });

      const created = await service.createSavedFilter('user-1', {
        name: 'My filter',
        filter: { status: 'bounced' } as never,
      });

      expect(created.name).toBe('My filter');
      expect(savedMessageFiltersRepository.create).toHaveBeenCalledWith({
        userId: 'user-1',
        name: 'My filter',
        filter: { status: 'bounced' },
      });

      await service.deleteSavedFilter('filter-1', 'user-1');
      expect(savedMessageFiltersRepository.delete).toHaveBeenCalledWith(
        'filter-1',
        'user-1',
      );
    });
  });
});
