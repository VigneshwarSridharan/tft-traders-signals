import { ConfigService } from '@nestjs/config';
import { DelayedError } from 'bullmq';
import nodemailer from 'nodemailer';
import { EmailSenderService } from './email-sender.service';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import type { EmailMessageRow, SenderAccountRow } from '../database/rows';
import type { EnvConfig } from '../config/env.validation';
import { encryptSecret } from '../common/crypto.util';
import { NotificationsService } from '../notifications/notifications.service';

jest.mock('nodemailer');

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
    credential_enc: encryptSecret(
      'app-password',
      'test-key-32-chars-minimum-000000',
    ),
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

function buildJob(
  overrides: Partial<{ attemptsMade: number; attempts: number }> = {},
) {
  return {
    data: { messageId: 'message-1' },
    attemptsMade: overrides.attemptsMade ?? 0,
    opts: { attempts: overrides.attempts ?? 3 },
    moveToDelayed: jest.fn().mockResolvedValue(undefined),
  };
}

describe('EmailSenderService', () => {
  let service: EmailSenderService;
  let emailMessagesRepository: jest.Mocked<EmailMessagesRepository>;
  let senderAccountsRepository: jest.Mocked<SenderAccountsRepository>;
  let configService: ConfigService<EnvConfig, true>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let sendMail: jest.Mock;

  beforeEach(() => {
    emailMessagesRepository = {
      findById: jest.fn().mockResolvedValue(buildMessageRow()),
      markSending: jest.fn().mockResolvedValue(undefined),
      markSent: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      markQueued: jest.fn().mockResolvedValue(undefined),
      getAttachments: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EmailMessagesRepository>;

    senderAccountsRepository = {
      findById: jest.fn().mockResolvedValue(buildSenderAccountRow()),
      getUsage: jest.fn().mockResolvedValue({ dailyUsed: 0, hourlyUsed: 0 }),
    } as unknown as jest.Mocked<SenderAccountsRepository>;

    configService = {
      get: jest.fn(() => 'test-key-32-chars-minimum-000000'),
    } as unknown as ConfigService<EnvConfig, true>;

    sendMail = jest.fn().mockResolvedValue({ response: '250 OK' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail,
      close: jest.fn(),
    });

    notificationsService = {
      notify: jest.fn().mockResolvedValue(undefined),
      notifyAdmins: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<NotificationsService>;

    service = new EmailSenderService(
      emailMessagesRepository,
      senderAccountsRepository,
      configService,
      notificationsService,
    );
  });

  it('sends the message and marks it sent', async () => {
    const job = buildJob();
    await service.processSendJob(job as never, 'token-1');

    expect(emailMessagesRepository.markSending).toHaveBeenCalledWith(
      'message-1',
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '"Jane Doe" <jane@acme.com>',
        subject: 'Hello Jane',
        messageId: '<abc@test.local>',
      }),
    );
    expect(emailMessagesRepository.markSent).toHaveBeenCalledWith(
      'message-1',
      '250 OK',
      expect.any(Date),
    );
  });

  it('sends a scheduled message the same way as a queued one once its delayed job fires', async () => {
    emailMessagesRepository.findById.mockResolvedValue(
      buildMessageRow({ status: 'scheduled', queued_at: null }),
    );

    await service.processSendJob(buildJob() as never, 'token-1');

    expect(emailMessagesRepository.markSending).toHaveBeenCalledWith(
      'message-1',
    );
    expect(sendMail).toHaveBeenCalled();
    expect(emailMessagesRepository.markSent).toHaveBeenCalledWith(
      'message-1',
      '250 OK',
      expect.any(Date),
    );
  });

  it('is idempotent when the message was already sent', async () => {
    emailMessagesRepository.findById.mockResolvedValue(
      buildMessageRow({ status: 'sent' }),
    );

    await service.processSendJob(buildJob() as never, 'token-1');

    expect(sendMail).not.toHaveBeenCalled();
    expect(emailMessagesRepository.markSending).not.toHaveBeenCalled();
  });

  it('skips a scheduled send that was cancelled before the delayed job fired', async () => {
    emailMessagesRepository.findById.mockResolvedValue(
      buildMessageRow({ status: 'cancelled' }),
    );

    await service.processSendJob(buildJob() as never, 'token-1');

    expect(sendMail).not.toHaveBeenCalled();
    expect(emailMessagesRepository.markSending).not.toHaveBeenCalled();
  });

  it('delays the job with DelayedError when the daily quota is exceeded', async () => {
    senderAccountsRepository.findById.mockResolvedValue(
      buildSenderAccountRow({ daily_quota: 5 }),
    );
    senderAccountsRepository.getUsage.mockResolvedValue({
      dailyUsed: 5,
      hourlyUsed: 0,
    });
    const job = buildJob();

    await expect(
      service.processSendJob(job as never, 'token-1'),
    ).rejects.toBeInstanceOf(DelayedError);

    expect(job.moveToDelayed).toHaveBeenCalledWith(
      expect.any(Number),
      'token-1',
    );
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('reverts to queued on a non-final failed attempt so BullMQ can retry', async () => {
    sendMail.mockRejectedValue(new Error('SMTP timeout'));
    const job = buildJob({ attemptsMade: 0, attempts: 3 });

    await expect(service.processSendJob(job as never)).rejects.toThrow(
      'SMTP timeout',
    );

    expect(emailMessagesRepository.markQueued).toHaveBeenCalledWith(
      'message-1',
    );
    expect(emailMessagesRepository.markFailed).not.toHaveBeenCalled();
  });

  it('marks the message failed with the SMTP error on the final attempt', async () => {
    sendMail.mockRejectedValue(new Error('Invalid recipient'));
    const job = buildJob({ attemptsMade: 2, attempts: 3 });

    await expect(service.processSendJob(job as never)).rejects.toThrow(
      'Invalid recipient',
    );

    expect(emailMessagesRepository.markFailed).toHaveBeenCalledWith(
      'message-1',
      'Invalid recipient',
    );
    expect(emailMessagesRepository.markQueued).not.toHaveBeenCalled();
    expect(notificationsService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'send_failed',
        messageId: 'message-1',
      }),
    );
  });

  it('notifies admins once usage crosses the quota warning threshold', async () => {
    senderAccountsRepository.findById.mockResolvedValue(
      buildSenderAccountRow({ daily_quota: 10 }),
    );
    senderAccountsRepository.getUsage.mockResolvedValue({
      dailyUsed: 9,
      hourlyUsed: 0,
    });

    await service.processSendJob(buildJob() as never, 'token-1');

    expect(notificationsService.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'quota_warning' }),
    );
  });

  it('does not warn again for the same account within the cooldown window', async () => {
    senderAccountsRepository.findById.mockResolvedValue(
      buildSenderAccountRow({ daily_quota: 10 }),
    );
    senderAccountsRepository.getUsage.mockResolvedValue({
      dailyUsed: 9,
      hourlyUsed: 0,
    });

    await service.processSendJob(buildJob() as never, 'token-1');
    await service.processSendJob(buildJob() as never, 'token-1');

    expect(notificationsService.notifyAdmins).toHaveBeenCalledTimes(1);
  });

  describe('sendNow', () => {
    it('sends immediately and returns the SMTP response without touching message state', async () => {
      const response = await service.sendNow({
        senderAccount: buildSenderAccountRow(),
        to: 'me@company.com',
        subject: '[TEST] Hello',
        html: '<p>Hi</p>',
        text: 'Hi',
      });

      expect(response).toBe('250 OK');
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Sales Team" <sales@company.com>',
          to: 'me@company.com',
          subject: '[TEST] Hello',
        }),
      );
      expect(emailMessagesRepository.markSent).not.toHaveBeenCalled();
    });

    it('propagates SMTP errors', async () => {
      sendMail.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.sendNow({
          senderAccount: buildSenderAccountRow(),
          to: 'me@company.com',
          subject: 'Hello',
        }),
      ).rejects.toThrow('Connection refused');
    });
  });
});
