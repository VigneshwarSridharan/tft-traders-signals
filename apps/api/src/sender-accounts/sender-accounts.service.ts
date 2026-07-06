import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  SenderAccountSummary,
  VerifySenderAccountResponse,
} from '@tft/shared';
import type { EnvConfig } from '../config/env.validation';
import { decryptSecret, encryptSecret } from '../common/crypto.util';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import { MailConnectionTester } from './mail-connection-tester.service';
import { toSenderAccountSummary } from './sender-accounts.mapper';
import type {
  CreateSenderAccountDto,
  UpdateSenderAccountDto,
} from './dto/sender-accounts.schemas';

@Injectable()
export class SenderAccountsService {
  constructor(
    private readonly senderAccountsRepository: SenderAccountsRepository,
    private readonly mailConnectionTester: MailConnectionTester,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  private get encryptionKey(): string {
    return this.configService.get('APP_ENCRYPTION_KEY', { infer: true });
  }

  async list(): Promise<SenderAccountSummary[]> {
    const [rows, usageByAccount] = await Promise.all([
      this.senderAccountsRepository.list(),
      this.senderAccountsRepository.getUsageForAll(),
    ]);
    return rows.map((row) =>
      toSenderAccountSummary(
        row,
        usageByAccount.get(row.id) ?? { dailyUsed: 0, hourlyUsed: 0 },
      ),
    );
  }

  async get(id: string): Promise<SenderAccountSummary> {
    const row = await this.senderAccountsRepository.findById(id);
    if (!row) {
      throw new NotFoundException('Sender account not found');
    }
    const usage = await this.senderAccountsRepository.getUsage(id);
    return toSenderAccountSummary(row, usage);
  }

  async create(input: CreateSenderAccountDto): Promise<SenderAccountSummary> {
    const existing = await this.senderAccountsRepository.findByEmail(
      input.email,
    );
    if (existing) {
      throw new ConflictException(
        'A sender account with this email already exists',
      );
    }

    const row = await this.senderAccountsRepository.create({
      email: input.email,
      displayName: input.displayName ?? null,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      credentialEnc: encryptSecret(input.appPassword, this.encryptionKey),
      signatureHtml: input.signatureHtml ?? null,
      dailyQuota: input.dailyQuota ?? null,
      hourlyQuota: input.hourlyQuota ?? null,
    });

    return toSenderAccountSummary(row, { dailyUsed: 0, hourlyUsed: 0 });
  }

  async update(
    id: string,
    patch: UpdateSenderAccountDto,
  ): Promise<SenderAccountSummary> {
    const existing = await this.senderAccountsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Sender account not found');
    }

    const { appPassword, ...rest } = patch;
    const updated = await this.senderAccountsRepository.update(id, {
      ...rest,
      credentialEnc: appPassword
        ? encryptSecret(appPassword, this.encryptionKey)
        : undefined,
    });
    if (!updated) {
      throw new NotFoundException('Sender account not found');
    }

    const usage = await this.senderAccountsRepository.getUsage(id);
    return toSenderAccountSummary(updated, usage);
  }

  async delete(id: string): Promise<void> {
    const existing = await this.senderAccountsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Sender account not found');
    }
    const messageCount = await this.senderAccountsRepository.countMessages(id);
    if (messageCount > 0) {
      throw new ConflictException(
        'This account has sent messages and cannot be deleted; disable it instead',
      );
    }
    await this.senderAccountsRepository.delete(id);
  }

  async verify(id: string): Promise<VerifySenderAccountResponse> {
    const row = await this.senderAccountsRepository.findById(id);
    if (!row) {
      throw new NotFoundException('Sender account not found');
    }

    const password = decryptSecret(row.credential_enc, this.encryptionKey);
    const result = await this.mailConnectionTester.verify({
      email: row.email,
      password,
      smtpHost: row.smtp_host,
      smtpPort: row.smtp_port,
      imapHost: row.imap_host,
      imapPort: row.imap_port,
    });

    const status = result.smtp.ok && result.imap.ok ? 'active' : 'auth_failed';
    const updated = await this.senderAccountsRepository.setVerificationResult(
      id,
      status,
    );

    const messages = [
      `SMTP: ${result.smtp.message}`,
      `IMAP: ${result.imap.message}`,
    ];

    return {
      status,
      smtpOk: result.smtp.ok,
      imapOk: result.imap.ok,
      message: messages.join(' · '),
      lastVerifiedAt: updated?.last_verified_at?.toISOString() ?? null,
    };
  }
}
