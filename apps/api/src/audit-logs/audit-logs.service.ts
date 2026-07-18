import { Injectable } from '@nestjs/common';
import type { AuditLogListResponse } from '@tft/shared';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { UsersRepository } from '../database/users.repository';
import { toAuditLogSummary } from './audit-logs.mapper';
import type { AuditLogListQueryDto } from './dto/audit-logs.schemas';

@Injectable()
export class AuditLogsService {
  constructor(
    private readonly auditLogsRepository: AuditLogsRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  async list(query: AuditLogListQueryDto): Promise<AuditLogListResponse> {
    const { rows, total } = await this.auditLogsRepository.list({
      userId: query.userId,
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page,
      pageSize: query.pageSize,
    });

    const userIds = [
      ...new Set(
        rows
          .map((row) => row.user_id)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    ];
    const users = await this.usersRepository.findByIds(userIds);
    const userById = new Map(users.map((user) => [user.id, user]));

    return {
      items: rows.map((row) => toAuditLogSummary(row, userById)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
