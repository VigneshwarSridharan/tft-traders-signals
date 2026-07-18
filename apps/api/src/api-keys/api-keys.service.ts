import { Injectable, NotFoundException } from '@nestjs/common';
import type { ApiKeySummary, CreateApiKeyResponse } from '@tft/shared';
import { generateApiKeySecret } from '../common/id.util';
import { hashApiKeySecret } from '../common/crypto.util';
import { ApiKeysRepository } from '../database/api-keys.repository';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { UsersRepository } from '../database/users.repository';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { toApiKeySummary } from './api-keys.mapper';
import type { CreateApiKeyDto } from './dto/api-keys.schemas';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly apiKeysRepository: ApiKeysRepository,
    private readonly usersRepository: UsersRepository,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  /** Admins see every user's keys; everyone else sees only their own. */
  async list(currentUser: AccessTokenPayload): Promise<ApiKeySummary[]> {
    if (currentUser.role === 'admin') {
      const rows = await this.apiKeysRepository.listAll();
      const userIds = [...new Set(rows.map((row) => row.user_id))];
      const users = await this.usersRepository.findByIds(userIds);
      const userById = new Map(users.map((user) => [user.id, user]));
      return rows.map((row) => toApiKeySummary(row, userById.get(row.user_id)));
    }

    const rows = await this.apiKeysRepository.listForUser(currentUser.sub);
    return rows.map((row) => toApiKeySummary(row));
  }

  async create(
    currentUser: AccessTokenPayload,
    dto: CreateApiKeyDto,
  ): Promise<CreateApiKeyResponse> {
    const secret = generateApiKeySecret();
    const keyHash = hashApiKeySecret(secret);
    const row = await this.apiKeysRepository.create({
      userId: currentUser.sub,
      name: dto.name,
      keyHash,
      scopes: dto.scopes,
      expiresAt: dto.expiresAt ?? null,
    });

    await this.auditLogsRepository.record({
      userId: currentUser.sub,
      action: 'api_key.create',
      entityType: 'api_key',
      entityId: row.id,
      metadata: { name: row.name, scopes: row.scopes },
    });

    return { ...toApiKeySummary(row), secret };
  }

  /** Non-admins may only revoke their own key — 404 (not 403) if it isn't theirs, so existence isn't leaked. */
  async revoke(id: string, currentUser: AccessTokenPayload): Promise<void> {
    const row = await this.apiKeysRepository.findById(id);
    if (
      !row ||
      (currentUser.role !== 'admin' && row.user_id !== currentUser.sub)
    ) {
      throw new NotFoundException('API key not found');
    }

    await this.apiKeysRepository.revoke(id);

    await this.auditLogsRepository.record({
      userId: currentUser.sub,
      action: 'api_key.revoke',
      entityType: 'api_key',
      entityId: id,
      metadata: { name: row.name },
    });
  }
}
