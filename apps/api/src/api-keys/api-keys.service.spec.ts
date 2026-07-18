import { NotFoundException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { hashApiKeySecret } from '../common/crypto.util';
import { ApiKeysRepository } from '../database/api-keys.repository';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { UsersRepository } from '../database/users.repository';
import type { ApiKeyRow, UserRow } from '../database/rows';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';

function buildApiKeyRow(overrides: Partial<ApiKeyRow> = {}): ApiKeyRow {
  return {
    id: 'key-1',
    user_id: 'user-1',
    name: 'CI key',
    key_hash: 'hash',
    scopes: ['send'],
    last_used_at: null,
    expires_at: null,
    revoked_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function buildUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'user-1',
    email: 'agent@example.com',
    name: 'Agent',
    password_hash: 'hash',
    role: 'agent',
    is_active: true,
    last_login_at: null,
    theme: 'system',
    notification_prefs: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('ApiKeysService', () => {
  let apiKeysRepository: jest.Mocked<ApiKeysRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let auditLogsRepository: jest.Mocked<AuditLogsRepository>;
  let service: ApiKeysService;
  const agent: AccessTokenPayload = {
    sub: 'user-1',
    email: 'agent@example.com',
    role: 'agent',
  };

  beforeEach(() => {
    apiKeysRepository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByHash: jest.fn(),
      listForUser: jest.fn(),
      listAll: jest.fn(),
      revoke: jest.fn(),
      touchLastUsed: jest.fn(),
    } as unknown as jest.Mocked<ApiKeysRepository>;
    usersRepository = {
      findByIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<UsersRepository>;
    auditLogsRepository = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogsRepository>;

    service = new ApiKeysService(
      apiKeysRepository,
      usersRepository,
      auditLogsRepository,
    );
  });

  describe('create', () => {
    it('generates a secret whose hash matches what is persisted, and never returns key_hash', async () => {
      apiKeysRepository.create.mockImplementation((input) =>
        Promise.resolve(
          buildApiKeyRow({
            user_id: input.userId,
            name: input.name,
            key_hash: input.keyHash,
            scopes: input.scopes,
          }),
        ),
      );

      const result = await service.create(agent, {
        name: 'My key',
        scopes: ['send'],
      });

      expect(result.secret).toMatch(/^sk_live_/);
      expect(hashApiKeySecret(result.secret)).toBe(
        apiKeysRepository.create.mock.calls[0][0].keyHash,
      );
      expect(result).not.toHaveProperty('key_hash');
      expect(auditLogsRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'api_key.create',
          entityType: 'api_key',
        }),
      );
    });
  });

  describe('list', () => {
    it('scopes to the current user for non-admin roles', async () => {
      apiKeysRepository.listForUser.mockResolvedValue([buildApiKeyRow()]);

      const result = await service.list(agent);

      expect(apiKeysRepository.listForUser).toHaveBeenCalledWith('user-1');
      expect(apiKeysRepository.listAll).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('returns all users’ keys for admins', async () => {
      apiKeysRepository.listAll.mockResolvedValue([
        buildApiKeyRow({ id: 'key-1', user_id: 'user-1' }),
        buildApiKeyRow({ id: 'key-2', user_id: 'user-2' }),
      ]);
      usersRepository.findByIds.mockResolvedValue([
        buildUserRow({ id: 'user-1' }),
        buildUserRow({ id: 'user-2', name: 'Other' }),
      ]);

      const admin: AccessTokenPayload = {
        sub: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
      };
      const result = await service.list(admin);

      expect(apiKeysRepository.listAll).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[1].userName).toBe('Other');
    });
  });

  describe('revoke', () => {
    it('revokes a key owned by the current user', async () => {
      apiKeysRepository.findById.mockResolvedValue(buildApiKeyRow());

      await service.revoke('key-1', agent);

      expect(apiKeysRepository.revoke).toHaveBeenCalledWith('key-1');
      expect(auditLogsRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'api_key.revoke' }),
      );
    });

    it('throws NotFoundException (not Forbidden) when a non-admin tries to revoke another user’s key', async () => {
      apiKeysRepository.findById.mockResolvedValue(
        buildApiKeyRow({ user_id: 'someone-else' }),
      );

      await expect(service.revoke('key-1', agent)).rejects.toThrow(
        NotFoundException,
      );
      expect(apiKeysRepository.revoke).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an unknown key id', async () => {
      apiKeysRepository.findById.mockResolvedValue(null);

      await expect(service.revoke('missing', agent)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows an admin to revoke any key', async () => {
      apiKeysRepository.findById.mockResolvedValue(
        buildApiKeyRow({ user_id: 'someone-else' }),
      );
      const admin: AccessTokenPayload = {
        sub: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
      };

      await service.revoke('key-1', admin);

      expect(apiKeysRepository.revoke).toHaveBeenCalledWith('key-1');
    });
  });
});
