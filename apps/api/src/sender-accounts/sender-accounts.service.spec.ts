import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SenderAccountsService } from './sender-accounts.service';
import { MailConnectionTester } from './mail-connection-tester.service';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import { decryptSecret, encryptSecret } from '../common/crypto.util';
import type { SenderAccountRow } from '../database/rows';

const ENCRYPTION_KEY = 'a-super-secret-encryption-key-1234567890';

function buildRow(overrides: Partial<SenderAccountRow> = {}): SenderAccountRow {
  return {
    id: 'account-1',
    email: 'sales@company.com',
    display_name: 'Sales',
    smtp_host: 'smtp.zoho.com',
    smtp_port: 465,
    imap_host: 'imap.zoho.com',
    imap_port: 993,
    credential_enc: encryptSecret('app-password', ENCRYPTION_KEY),
    signature_html: null,
    daily_quota: 100,
    hourly_quota: 20,
    status: 'active',
    last_verified_at: null,
    imap_last_uid: '0',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('SenderAccountsService', () => {
  let service: SenderAccountsService;
  let repository: jest.Mocked<SenderAccountsRepository>;
  let mailConnectionTester: jest.Mocked<MailConnectionTester>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    repository = {
      list: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setVerificationResult: jest.fn(),
      delete: jest.fn(),
      countMessages: jest.fn(),
      getUsage: jest.fn(),
      getUsageForAll: jest.fn(),
    } as unknown as jest.Mocked<SenderAccountsRepository>;

    mailConnectionTester = {
      verify: jest.fn(),
    } as unknown as jest.Mocked<MailConnectionTester>;

    configService = {
      get: jest.fn(() => ENCRYPTION_KEY),
    } as unknown as jest.Mocked<ConfigService>;

    service = new SenderAccountsService(
      repository,
      mailConnectionTester,
      configService,
    );
  });

  describe('create', () => {
    it('rejects a duplicate email', async () => {
      repository.findByEmail.mockResolvedValue(buildRow());
      await expect(
        service.create({
          email: 'sales@company.com',
          appPassword: 'app-password',
          smtpHost: 'smtp.zoho.com',
          smtpPort: 465,
          imapHost: 'imap.zoho.com',
          imapPort: 993,
        }),
      ).rejects.toThrow(ConflictException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('encrypts the app password before persisting and never returns it', async () => {
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockImplementation((input) =>
        Promise.resolve(buildRow({ credential_enc: input.credentialEnc })),
      );

      const result = await service.create({
        email: 'sales@company.com',
        appPassword: 'my-app-password',
        smtpHost: 'smtp.zoho.com',
        smtpPort: 465,
        imapHost: 'imap.zoho.com',
        imapPort: 993,
      });

      const persistedEnvelope =
        repository.create.mock.calls[0][0].credentialEnc;
      expect(persistedEnvelope.equals(Buffer.from('my-app-password'))).toBe(
        false,
      );
      expect(decryptSecret(persistedEnvelope, ENCRYPTION_KEY)).toBe(
        'my-app-password',
      );
      expect(JSON.stringify(result)).not.toContain('my-app-password');
    });
  });

  describe('update', () => {
    it('rotates the credential only when a new app password is provided', async () => {
      const existing = buildRow();
      repository.findById.mockResolvedValue(existing);
      repository.update.mockResolvedValue(existing);
      repository.getUsage.mockResolvedValue({ dailyUsed: 0, hourlyUsed: 0 });

      await service.update('account-1', { displayName: 'New Name' });

      expect(repository.update).toHaveBeenCalledWith(
        'account-1',
        expect.objectContaining({ credentialEnc: undefined }),
      );
    });

    it('encrypts a rotated app password', async () => {
      const existing = buildRow();
      repository.findById.mockResolvedValue(existing);
      repository.update.mockResolvedValue(existing);
      repository.getUsage.mockResolvedValue({ dailyUsed: 0, hourlyUsed: 0 });

      await service.update('account-1', { appPassword: 'rotated-password' });

      const patch = repository.update.mock.calls[0][1];
      expect(decryptSecret(patch.credentialEnc!, ENCRYPTION_KEY)).toBe(
        'rotated-password',
      );
    });

    it('throws when the account does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', { displayName: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('blocks deleting an account that has sent messages', async () => {
      repository.findById.mockResolvedValue(buildRow());
      repository.countMessages.mockResolvedValue(3);

      await expect(service.delete('account-1')).rejects.toThrow(
        ConflictException,
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });

    it('deletes an account with no message history', async () => {
      repository.findById.mockResolvedValue(buildRow());
      repository.countMessages.mockResolvedValue(0);

      await service.delete('account-1');
      expect(repository.delete).toHaveBeenCalledWith('account-1');
    });
  });

  describe('verify', () => {
    it('decrypts the stored credential and marks the account active on success', async () => {
      repository.findById.mockResolvedValue(buildRow());
      mailConnectionTester.verify.mockResolvedValue({
        smtp: { ok: true, message: 'SMTP login succeeded' },
        imap: { ok: true, message: 'IMAP login succeeded' },
      });
      repository.setVerificationResult.mockResolvedValue(
        buildRow({ status: 'active', last_verified_at: new Date() }),
      );

      const result = await service.verify('account-1');

      expect(mailConnectionTester.verify).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'sales@company.com',
          password: 'app-password',
        }),
      );
      expect(repository.setVerificationResult).toHaveBeenCalledWith(
        'account-1',
        'active',
      );
      expect(result.status).toBe('active');
      expect(result.smtpOk).toBe(true);
      expect(result.imapOk).toBe(true);
    });

    it('marks the account auth_failed when either check fails', async () => {
      repository.findById.mockResolvedValue(buildRow());
      mailConnectionTester.verify.mockResolvedValue({
        smtp: { ok: false, message: 'Invalid credentials' },
        imap: { ok: true, message: 'IMAP login succeeded' },
      });
      repository.setVerificationResult.mockResolvedValue(
        buildRow({ status: 'auth_failed' }),
      );

      const result = await service.verify('account-1');

      expect(repository.setVerificationResult).toHaveBeenCalledWith(
        'account-1',
        'auth_failed',
      );
      expect(result.status).toBe('auth_failed');
      expect(result.message).toContain('Invalid credentials');
    });

    it('throws when the account does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.verify('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
