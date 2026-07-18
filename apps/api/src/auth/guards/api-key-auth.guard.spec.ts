import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { hashApiKeySecret } from '../../common/crypto.util';
import { ApiKeysRepository } from '../../database/api-keys.repository';
import { UsersRepository } from '../../database/users.repository';
import type { ApiKeyRow, UserRow } from '../../database/rows';

function buildApiKeyRow(overrides: Partial<ApiKeyRow> = {}): ApiKeyRow {
  return {
    id: 'key-1',
    user_id: 'user-1',
    name: 'CI key',
    key_hash: hashApiKeySecret('sk_live_test'),
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

function buildContext(authorization?: string): ExecutionContext {
  const request: Record<string, unknown> = {
    headers: authorization ? { authorization } : {},
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('ApiKeyAuthGuard', () => {
  let apiKeysRepository: jest.Mocked<ApiKeysRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let guard: ApiKeyAuthGuard;

  beforeEach(() => {
    apiKeysRepository = {
      findByHash: jest.fn(),
      touchLastUsed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ApiKeysRepository>;
    usersRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    guard = new ApiKeyAuthGuard(apiKeysRepository, usersRepository);
  });

  it('throws when no Authorization header is present', async () => {
    await expect(guard.canActivate(buildContext())).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws for an unknown key', async () => {
    apiKeysRepository.findByHash.mockResolvedValue(null);
    await expect(
      guard.canActivate(buildContext('Bearer sk_live_test')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws for a revoked key', async () => {
    apiKeysRepository.findByHash.mockResolvedValue(
      buildApiKeyRow({ revoked_at: new Date() }),
    );
    await expect(
      guard.canActivate(buildContext('Bearer sk_live_test')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws for an expired key', async () => {
    apiKeysRepository.findByHash.mockResolvedValue(
      buildApiKeyRow({ expires_at: new Date(Date.now() - 1000) }),
    );
    await expect(
      guard.canActivate(buildContext('Bearer sk_live_test')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws when the owning user is inactive', async () => {
    apiKeysRepository.findByHash.mockResolvedValue(buildApiKeyRow());
    usersRepository.findById.mockResolvedValue(
      buildUserRow({ is_active: false }),
    );
    await expect(
      guard.canActivate(buildContext('Bearer sk_live_test')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('populates request.user/apiKeyScopes/apiKeyId and touches last-used on success', async () => {
    const apiKey = buildApiKeyRow();
    const user = buildUserRow();
    apiKeysRepository.findByHash.mockResolvedValue(apiKey);
    usersRepository.findById.mockResolvedValue(user);

    const context = buildContext('Bearer sk_live_test');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const request = context
      .switchToHttp()
      .getRequest<Record<string, unknown>>();
    expect(request.user).toEqual({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    expect(request.apiKeyScopes).toEqual(['send']);
    expect(request.apiKeyId).toBe('key-1');
    expect(apiKeysRepository.touchLastUsed).toHaveBeenCalledWith('key-1');
  });
});
