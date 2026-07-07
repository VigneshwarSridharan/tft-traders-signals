import { readFile } from 'node:fs/promises';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DelayedError, type Job } from 'bullmq';
import nodemailer from 'nodemailer';
import type { EnvConfig } from '../config/env.validation';
import { decryptSecret } from '../common/crypto.util';
import { EmailMessagesRepository } from '../database/email-messages.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import type { SenderAccountRow } from '../database/rows';
import type { SendJobData } from './send-queue.service';

const QUOTA_RETRY_DELAY_MS = 5 * 60 * 1000;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Unknown send error';
}

@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);

  constructor(
    private readonly emailMessagesRepository: EmailMessagesRepository,
    private readonly senderAccountsRepository: SenderAccountsRepository,
    private readonly configService: ConfigService<EnvConfig, true>,
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
      return;
    }
    if (senderAccount.status !== 'active') {
      await this.emailMessagesRepository.markFailed(
        messageId,
        `Sender account is ${senderAccount.status}`,
      );
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
        attachments: attachmentPayload,
      });

      await this.emailMessagesRepository.markSent(
        messageId,
        String(info.response ?? '250 OK'),
        new Date(),
      );
    } catch (error) {
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (isFinalAttempt) {
        await this.emailMessagesRepository.markFailed(
          messageId,
          toErrorMessage(error),
        );
      } else {
        await this.emailMessagesRepository.markQueued(messageId);
      }
      throw error;
    } finally {
      transporter.close();
    }
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
