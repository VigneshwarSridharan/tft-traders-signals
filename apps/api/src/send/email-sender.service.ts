import { readFile } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DelayedError, type Job } from 'bullmq';
import nodemailer from 'nodemailer';
import type { EnvConfig } from '../config/env.validation';
import { decryptSecret } from '../common/crypto.util';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import type { EmailMessageRow, SenderAccountRow } from '../database/rows';
import { NotificationsService } from '../notifications/notifications.service';
import { WebhookDispatchService } from '../webhooks/webhook-dispatch.service';
import type { SendJobData } from './send-queue.service';

const QUOTA_RETRY_DELAY_MS = 5 * 60 * 1000;
// Notify admins once a sender account crosses this fraction of a quota,
// ahead of it actually being exceeded and blocking sends.
const QUOTA_WARNING_THRESHOLD = 0.9;
const QUOTA_WARNING_COOLDOWN_MS = 60 * 60 * 1000;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown send error';
}

function describeRecipient(message: {
  to_name: string | null;
  to_email: string;
}): string {
  return message.to_name ?? message.to_email;
}

@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);
  private readonly quotaWarningLastSentAt = new Map<string, number>();

  constructor(
    private readonly emailMessagesRepository: EmailMessagesRepository,
    private readonly senderAccountsRepository: SenderAccountsRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly notificationsService: NotificationsService,
    private readonly webhookDispatchService?: WebhookDispatchService,
  ) {}

  async processSendJob(job: Job<SendJobData>, token?: string): Promise<void> {
    const { messageId } = job.data;
    const message = await this.emailMessagesRepository.findById(messageId);
    if (!message) {
      this.logger.warn(`Message ${messageId} not found; dropping job`);
      return;
    }
    if (message.status === 'sent' || message.status === 'delivered') {
      // Already sent by a previous attempt (e.g. a stalled job re-run) — no-op.
      return;
    }
    if (message.status === 'cancelled') {
      // The scheduled send was cancelled after this job was already picked up.
      return;
    }

    const senderAccount = await this.senderAccountsRepository.findById(
      message.sender_account_id,
    );
    if (!senderAccount) {
      await this.emailMessagesRepository.markFailed(
        messageId,
        'Sender account no longer exists',
      );
      await this.notifySendFailed(message, 'Sender account no longer exists');
      return;
    }
    if (senderAccount.status !== 'active') {
      const reason = `Sender account is ${senderAccount.status}`;
      await this.emailMessagesRepository.markFailed(messageId, reason);
      await this.notifySendFailed(message, reason);
      return;
    }

    const usage = await this.senderAccountsRepository.getUsage(
      senderAccount.id,
    );
    const dailyExceeded =
      senderAccount.daily_quota !== null &&
      usage.dailyUsed >= senderAccount.daily_quota;
    const hourlyExceeded =
      senderAccount.hourly_quota !== null &&
      usage.hourlyUsed >= senderAccount.hourly_quota;
    if (dailyExceeded || hourlyExceeded) {
      if (token) {
        await job.moveToDelayed(Date.now() + QUOTA_RETRY_DELAY_MS, token);
        throw new DelayedError();
      }
      throw new Error('Sender account quota exceeded');
    }
    await this.warnIfNearQuota(senderAccount, usage);

    await this.emailMessagesRepository.markSending(messageId);

    const password = decryptSecret(
      senderAccount.credential_enc,
      this.configService.get('APP_ENCRYPTION_KEY', { infer: true }),
    );
    const attachments =
      await this.emailMessagesRepository.getAttachments(messageId);

    const transporter = nodemailer.createTransport({
      host: senderAccount.smtp_host,
      port: senderAccount.smtp_port,
      secure: senderAccount.smtp_port === 465,
      auth: { user: senderAccount.email, pass: password },
      connectionTimeout: 15_000,
    });

    try {
      const attachmentPayload = await Promise.all(
        attachments.map(async (attachment) => ({
          filename: attachment.filename,
          content: await readFile(attachment.storage_path),
          contentType: attachment.content_type ?? undefined,
        })),
      );

      const unsubscribeUrl = `https://${this.configService.get('TRACKING_DOMAIN', { infer: true })}/u/${message.public_token}`;

      const info = await transporter.sendMail({
        from: senderAccount.display_name
          ? `"${senderAccount.display_name}" <${senderAccount.email}>`
          : senderAccount.email,
        to: message.to_name
          ? `"${message.to_name}" <${message.to_email}>`
          : message.to_email,
        subject: message.subject ?? '',
        html: message.body_html_rendered ?? undefined,
        text: message.body_text_rendered ?? undefined,
        messageId: message.message_id_header ?? undefined,
        // Threads a follow-up against its parent (Task 18) — mirrors how
        // apps/api/src/inbound reads these same two headers on the way in.
        inReplyTo: message.in_reply_to_header ?? undefined,
        references: message.references_header ?? undefined,
        attachments: attachmentPayload,
        // RFC 8058 one-click unsubscribe headers — the compose-time footer
        // (unsubscribe-footer.util.ts) links to the same /u/:token page.
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });

      await this.emailMessagesRepository.markSent(
        messageId,
        String(info.response ?? '250 OK'),
        new Date(),
      );
      await this.webhookDispatchService?.dispatch('sent', {
        messageId: message.id,
        toEmail: message.to_email,
        subject: message.subject,
      });
    } catch (error) {
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        const errorMessage = toErrorMessage(error);
        await this.emailMessagesRepository.markFailed(messageId, errorMessage);
        await this.notifySendFailed(message, errorMessage);
      } else {
        await this.emailMessagesRepository.markQueued(messageId);
      }
      throw error;
    } finally {
      transporter.close();
    }
  }

  private async notifySendFailed(
    message: EmailMessageRow,
    reason: string,
  ): Promise<void> {
    await this.notificationsService.notify({
      userId: message.sent_by,
      type: 'send_failed',
      title: `Failed to send "${message.subject ?? '(no subject)'}" to ${describeRecipient(message)}`,
      body: reason,
      messageId: message.id,
    });
  }

  private async warnIfNearQuota(
    senderAccount: SenderAccountRow,
    usage: { dailyUsed: number; hourlyUsed: number },
  ): Promise<void> {
    const nearingDaily =
      senderAccount.daily_quota !== null &&
      usage.dailyUsed / senderAccount.daily_quota >= QUOTA_WARNING_THRESHOLD;
    const nearingHourly =
      senderAccount.hourly_quota !== null &&
      usage.hourlyUsed / senderAccount.hourly_quota >= QUOTA_WARNING_THRESHOLD;
    if (!nearingDaily && !nearingHourly) {
      return;
    }

    const lastSentAt = this.quotaWarningLastSentAt.get(senderAccount.id);
    if (lastSentAt && Date.now() - lastSentAt < QUOTA_WARNING_COOLDOWN_MS) {
      return;
    }
    this.quotaWarningLastSentAt.set(senderAccount.id, Date.now());

    const period = nearingDaily ? 'daily' : 'hourly';
    await this.notificationsService.notifyAdmins({
      type: 'quota_warning',
      title: `Sender account ${senderAccount.email} is nearing its ${period} send quota`,
      body: `Daily: ${usage.dailyUsed}/${senderAccount.daily_quota ?? '∞'}, Hourly: ${usage.hourlyUsed}/${senderAccount.hourly_quota ?? '∞'}`,
    });
  }

  async sendNow(params: {
    senderAccount: SenderAccountRow;
    to: string;
    toName?: string | null;
    subject: string;
    html?: string | null;
    text?: string | null;
  }): Promise<string> {
    const { senderAccount } = params;
    const password = decryptSecret(
      senderAccount.credential_enc,
      this.configService.get('APP_ENCRYPTION_KEY', { infer: true }),
    );

    const transporter = nodemailer.createTransport({
      host: senderAccount.smtp_host,
      port: senderAccount.smtp_port,
      secure: senderAccount.smtp_port === 465,
      auth: { user: senderAccount.email, pass: password },
      connectionTimeout: 15_000,
    });

    try {
      const info = await transporter.sendMail({
        from: senderAccount.display_name
          ? `"${senderAccount.display_name}" <${senderAccount.email}>`
          : senderAccount.email,
        to: params.toName ? `"${params.toName}" <${params.to}>` : params.to,
        subject: params.subject,
        html: params.html ?? undefined,
        text: params.text ?? undefined,
      });
      return String(info.response ?? '250 OK');
    } finally {
      transporter.close();
    }
  }
}
