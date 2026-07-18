import { NotFoundException } from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { SentMailService } from './sent-mail.service';
import { EmailLinksRepository } from '../database/email-links.repository';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { InboundRepository } from '../database/inbound.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import { TagsRepository } from '../database/tags.repository';
import { TemplatesRepository } from '../database/templates.repository';
import { TrackingEventsRepository } from '../database/tracking-events.repository';
import type {
  BounceRow,
  EmailLinkRow,
  EmailMessageRow,
  SenderAccountRow,
  TagRow,
  TrackingEventRow,
} from '../database/rows';

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
    signature_html: null,
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
    status: 'sent',
    smtp_response: '250 OK',
    queued_at: new Date(),
    sent_at: new Date(),
    open_count: 2,
    unique_open_hint: true,
    first_opened_at: new Date(),
    last_opened_at: new Date(),
    click_count: 1,
    first_clicked_at: new Date(),
    last_clicked_at: new Date(),
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

function buildLinkRow(overrides: Partial<EmailLinkRow> = {}): EmailLinkRow {
  return {
    id: 'link-1',
    message_id: 'message-1',
    token: 'link-token',
    original_url: 'https://example.com',
    link_label: 'Example',
    position: 0,
    click_count: 1,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildEventRow(
  overrides: Partial<TrackingEventRow> = {},
): TrackingEventRow {
  return {
    id: '1',
    message_id: 'message-1',
    link_id: null,
    event_type: 'open',
    occurred_at: new Date(),
    ip: '1.2.3.4',
    user_agent: 'Mozilla/5.0',
    device_type: 'desktop',
    os: 'macOS',
    browser: 'Chrome',
    geo_country: 'US',
    geo_city: 'NYC',
    is_bot: false,
    is_proxy: false,
    metadata: {},
    ...overrides,
  };
}

function buildBounceRow(overrides: Partial<BounceRow> = {}): BounceRow {
  return {
    id: 'bounce-1',
    message_id: 'message-1',
    inbound_message_id: 'inbound-1',
    bounce_class: 'hard',
    status_code: '5.1.1',
    diagnostic: 'User unknown',
    bounced_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

const ADMIN_USER: AccessTokenPayload = {
  sub: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};

const AGENT_USER: AccessTokenPayload = {
  sub: 'user-1',
  email: 'agent@example.com',
  role: 'agent',
};

const OTHER_AGENT_USER: AccessTokenPayload = {
  sub: 'user-2',
  email: 'other-agent@example.com',
  role: 'agent',
};

describe('SentMailService', () => {
  let service: SentMailService;
  let emailMessagesRepository: jest.Mocked<EmailMessagesRepository>;
  let emailLinksRepository: jest.Mocked<EmailLinksRepository>;
  let trackingEventsRepository: jest.Mocked<TrackingEventsRepository>;
  let inboundRepository: jest.Mocked<InboundRepository>;
  let senderAccountsRepository: jest.Mocked<SenderAccountsRepository>;
  let templatesRepository: jest.Mocked<TemplatesRepository>;
  let tagsRepository: jest.Mocked<TagsRepository>;

  beforeEach(() => {
    emailMessagesRepository = {
      list: jest.fn(),
      findById: jest.fn(),
      getAttachments: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EmailMessagesRepository>;

    emailLinksRepository = {
      listForMessage: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EmailLinksRepository>;

    trackingEventsRepository = {
      listForMessage: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TrackingEventsRepository>;

    inboundRepository = {
      findBounceByMessageId: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<InboundRepository>;

    senderAccountsRepository = {
      list: jest.fn().mockResolvedValue([buildSenderAccountRow()]),
    } as unknown as jest.Mocked<SenderAccountsRepository>;

    templatesRepository = {
      findTemplateNamesForVersionIds: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<TemplatesRepository>;

    tagsRepository = {
      findById: jest.fn(),
      listForEntity: jest.fn().mockResolvedValue([]),
      listForEntities: jest.fn().mockResolvedValue(new Map()),
      addTagging: jest.fn(),
      removeTagging: jest.fn(),
    } as unknown as jest.Mocked<TagsRepository>;

    service = new SentMailService(
      emailMessagesRepository,
      emailLinksRepository,
      trackingEventsRepository,
      inboundRepository,
      senderAccountsRepository,
      templatesRepository,
      tagsRepository,
    );
  });

  describe('list', () => {
    it('maps rows into list items joined with sender account, template, and tags', async () => {
      emailMessagesRepository.list.mockResolvedValue({
        rows: [buildMessageRow({ template_version_id: 'version-1' })],
        total: 1,
      });
      templatesRepository.findTemplateNamesForVersionIds.mockResolvedValue(
        new Map([
          ['version-1', { templateId: 'template-1', templateName: 'Quote' }],
        ]),
      );
      tagsRepository.listForEntities.mockResolvedValue(
        new Map([
          ['message-1', [{ id: 'tag-1', name: 'VIP', color: null } as TagRow]],
        ]),
      );

      const result = await service.list(
        {
          sort: 'sentAt',
          sortDir: 'desc',
          page: 1,
          pageSize: 25,
        },
        ADMIN_USER,
      );

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        id: 'message-1',
        senderAccountEmail: 'sales@company.com',
        templateId: 'template-1',
        templateName: 'Quote',
        openCount: 2,
        clickCount: 1,
      });
      expect(result.items[0].tags).toEqual([
        { id: 'tag-1', name: 'VIP', color: null },
      ]);
    });

    it('returns an empty list without querying joins when there are no rows', async () => {
      emailMessagesRepository.list.mockResolvedValue({ rows: [], total: 0 });

      const result = await service.list(
        {
          sort: 'sentAt',
          sortDir: 'desc',
          page: 1,
          pageSize: 25,
        },
        ADMIN_USER,
      );

      expect(result.items).toEqual([]);
      expect(senderAccountsRepository.list).not.toHaveBeenCalled();
    });

    it("scopes an agent's list to their own sends", async () => {
      emailMessagesRepository.list.mockResolvedValue({ rows: [], total: 0 });

      await service.list(
        { sort: 'sentAt', sortDir: 'desc', page: 1, pageSize: 25 },
        AGENT_USER,
      );

      expect(emailMessagesRepository.list).toHaveBeenCalledWith(
        expect.objectContaining({ sentBy: AGENT_USER.sub }),
      );
    });

    it("does not scope an admin's list by sender", async () => {
      emailMessagesRepository.list.mockResolvedValue({ rows: [], total: 0 });

      await service.list(
        { sort: 'sentAt', sortDir: 'desc', page: 1, pageSize: 25 },
        ADMIN_USER,
      );

      expect(emailMessagesRepository.list).toHaveBeenCalledWith(
        expect.objectContaining({ sentBy: undefined }),
      );
    });
  });

  describe('get', () => {
    it('throws when the message does not exist', async () => {
      emailMessagesRepository.findById.mockResolvedValue(null);

      await expect(
        service.get('missing', { includeBotEvents: false }, ADMIN_USER),
      ).rejects.toThrow(NotFoundException);
    });

    it('assembles the detail view from links, events, and a bounce record', async () => {
      emailMessagesRepository.findById.mockResolvedValue(
        buildMessageRow({ status: 'bounced', bounce_type: 'hard' }),
      );
      emailLinksRepository.listForMessage.mockResolvedValue([buildLinkRow()]);
      trackingEventsRepository.listForMessage.mockResolvedValue([
        buildEventRow({ event_type: 'click', link_id: 'link-1' }),
      ]);
      inboundRepository.findBounceByMessageId.mockResolvedValue(
        buildBounceRow(),
      );

      const detail = await service.get(
        'message-1',
        { includeBotEvents: false },
        ADMIN_USER,
      );

      expect(trackingEventsRepository.listForMessage).toHaveBeenCalledWith(
        'message-1',
        false,
      );
      expect(detail.links).toHaveLength(1);
      expect(detail.events).toHaveLength(1);
      expect(detail.events[0]).toMatchObject({
        eventType: 'click',
        linkId: 'link-1',
        linkUrl: 'https://example.com',
      });
      expect(detail.bounce).toMatchObject({
        bounceClass: 'hard',
        statusCode: '5.1.1',
      });
    });

    it('lets an agent fetch a message they sent', async () => {
      emailMessagesRepository.findById.mockResolvedValue(
        buildMessageRow({ sent_by: AGENT_USER.sub }),
      );

      const detail = await service.get(
        'message-1',
        { includeBotEvents: false },
        AGENT_USER,
      );

      expect(detail.id).toBe('message-1');
    });

    it("404s an agent fetching another agent's message", async () => {
      emailMessagesRepository.findById.mockResolvedValue(
        buildMessageRow({ sent_by: OTHER_AGENT_USER.sub }),
      );

      await expect(
        service.get('message-1', { includeBotEvents: false }, AGENT_USER),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addTag / removeTag', () => {
    it('rejects an unknown tag', async () => {
      emailMessagesRepository.findById.mockResolvedValue(buildMessageRow());
      tagsRepository.findById.mockResolvedValue(null);

      await expect(
        service.addTag('message-1', 'missing-tag', ADMIN_USER),
      ).rejects.toThrow(NotFoundException);
      expect(tagsRepository.addTagging).not.toHaveBeenCalled();
    });

    it('adds a tagging and returns the refreshed detail', async () => {
      emailMessagesRepository.findById.mockResolvedValue(buildMessageRow());
      tagsRepository.findById.mockResolvedValue({
        id: 'tag-1',
        name: 'VIP',
        color: null,
        created_at: new Date(),
        updated_at: new Date(),
      });

      const detail = await service.addTag('message-1', 'tag-1', ADMIN_USER);

      expect(tagsRepository.addTagging).toHaveBeenCalledWith(
        'tag-1',
        'message',
        'message-1',
      );
      expect(detail.id).toBe('message-1');
    });

    it('removes a tagging and returns the refreshed detail', async () => {
      emailMessagesRepository.findById.mockResolvedValue(buildMessageRow());

      const detail = await service.removeTag('message-1', 'tag-1', ADMIN_USER);

      expect(tagsRepository.removeTagging).toHaveBeenCalledWith(
        'tag-1',
        'message',
        'message-1',
      );
      expect(detail.id).toBe('message-1');
    });

    it("404s an agent tagging another agent's message", async () => {
      emailMessagesRepository.findById.mockResolvedValue(
        buildMessageRow({ sent_by: OTHER_AGENT_USER.sub }),
      );

      await expect(
        service.addTag('message-1', 'tag-1', AGENT_USER),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
