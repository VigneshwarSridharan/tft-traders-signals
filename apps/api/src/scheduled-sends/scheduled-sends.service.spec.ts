import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ScheduledSendsService } from './scheduled-sends.service';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import {
  ScheduledSendsRepository,
  type ScheduledSendListRow,
} from '../database/scheduled-sends.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import { TemplatesRepository } from '../database/templates.repository';
import { SendQueueService } from '../send/send-queue.service';
import type { EmailMessageRow, ScheduledSendRow } from '../database/rows';

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
    status: 'scheduled',
    smtp_response: null,
    queued_at: null,
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

function buildScheduledSendRow(
  overrides: Partial<ScheduledSendRow> = {},
): ScheduledSendRow {
  return {
    id: 'scheduled-1',
    message_id: 'message-1',
    scheduled_for: new Date(Date.now() + 5 * 60 * 1000),
    timezone: 'UTC',
    job_id: 'scheduled-message-1',
    cancelled_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('ScheduledSendsService', () => {
  let service: ScheduledSendsService;
  let scheduledSendsRepository: jest.Mocked<ScheduledSendsRepository>;
  let emailMessagesRepository: jest.Mocked<EmailMessagesRepository>;
  let senderAccountsRepository: jest.Mocked<SenderAccountsRepository>;
  let templatesRepository: jest.Mocked<TemplatesRepository>;
  let sendQueueService: jest.Mocked<SendQueueService>;

  beforeEach(() => {
    scheduledSendsRepository = {
      findByMessageId: jest.fn().mockResolvedValue(buildScheduledSendRow()),
      markCancelled: jest.fn().mockResolvedValue(undefined),
      reschedule: jest.fn().mockResolvedValue(buildScheduledSendRow()),
      list: jest.fn(),
    } as unknown as jest.Mocked<ScheduledSendsRepository>;

    emailMessagesRepository = {
      findById: jest.fn().mockResolvedValue(buildMessageRow()),
      markCancelled: jest.fn().mockResolvedValue(true),
      getAttachments: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EmailMessagesRepository>;

    senderAccountsRepository = {
      list: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<SenderAccountsRepository>;

    templatesRepository = {
      findTemplateNamesForVersionIds: jest.fn().mockResolvedValue(new Map()),
    } as unknown as jest.Mocked<TemplatesRepository>;

    sendQueueService = {
      cancelScheduled: jest.fn().mockResolvedValue(true),
      enqueueScheduled: jest.fn().mockResolvedValue('scheduled-message-1-new'),
    } as unknown as jest.Mocked<SendQueueService>;

    service = new ScheduledSendsService(
      scheduledSendsRepository,
      emailMessagesRepository,
      senderAccountsRepository,
      templatesRepository,
      sendQueueService,
    );
  });

  describe('cancel', () => {
    it('removes the delayed job and marks both rows cancelled', async () => {
      const result = await service.cancel('message-1');

      expect(sendQueueService.cancelScheduled).toHaveBeenCalledWith(
        'scheduled-message-1',
      );
      expect(scheduledSendsRepository.markCancelled).toHaveBeenCalledWith(
        'scheduled-1',
      );
      expect(emailMessagesRepository.markCancelled).toHaveBeenCalledWith(
        'message-1',
      );
      expect(result.id).toBe('message-1');
    });

    it('throws if there is no scheduled_sends row for the message', async () => {
      scheduledSendsRepository.findByMessageId.mockResolvedValue(null);

      await expect(service.cancel('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects cancelling a message that already left the scheduled state', async () => {
      emailMessagesRepository.findById.mockResolvedValue(
        buildMessageRow({ status: 'sent' }),
      );

      await expect(service.cancel('message-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(sendQueueService.cancelScheduled).not.toHaveBeenCalled();
    });
  });

  describe('reschedule', () => {
    it('cancels the old job, enqueues a new one, and persists the new schedule', async () => {
      const scheduledFor = new Date(Date.now() + 10 * 60 * 1000);

      await service.reschedule('message-1', {
        scheduledFor,
        timezone: 'America/New_York',
      });

      expect(sendQueueService.cancelScheduled).toHaveBeenCalledWith(
        'scheduled-message-1',
      );
      expect(sendQueueService.enqueueScheduled).toHaveBeenCalledWith(
        'message-1',
        scheduledFor,
      );
      expect(scheduledSendsRepository.reschedule).toHaveBeenCalledWith(
        'scheduled-1',
        scheduledFor,
        'America/New_York',
        'scheduled-message-1-new',
      );
    });

    it('rejects rescheduling a message that already left the scheduled state', async () => {
      emailMessagesRepository.findById.mockResolvedValue(
        buildMessageRow({ status: 'sending' }),
      );

      await expect(
        service.reschedule('message-1', {
          scheduledFor: new Date(Date.now() + 60_000),
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sendQueueService.enqueueScheduled).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('maps rows with sender account and template info', async () => {
      const row: ScheduledSendListRow = {
        id: 'scheduled-1',
        message_id: 'message-1',
        scheduled_for: new Date(),
        timezone: 'UTC',
        to_email: 'jane@acme.com',
        to_name: 'Jane Doe',
        subject: 'Hello',
        sender_account_id: 'sender-1',
        template_version_id: null,
        created_at: new Date(),
      };
      scheduledSendsRepository.list.mockResolvedValue({
        rows: [row],
        total: 1,
      });

      const result = await service.list({ page: 1, pageSize: 25 });

      expect(result.total).toBe(1);
      expect(result.items[0].messageId).toBe('message-1');
    });
  });
});
