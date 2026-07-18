import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { Queryable } from './queryable';
import type { AuditLogRow } from './rows';

export interface RecordAuditLogInput {
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
}

export interface AuditLogListFilter {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page: number;
  pageSize: number;
}

@Injectable()
export class AuditLogsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async record(
    input: RecordAuditLogInput,
    executor: Queryable = this.pool,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.userId,
        input.action,
        input.entityType,
        input.entityId,
        JSON.stringify(input.metadata),
      ],
    );
  }

  async list(
    filter: AuditLogListFilter,
  ): Promise<{ rows: AuditLogRow[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.userId) {
      params.push(filter.userId);
      conditions.push(`user_id = $${params.length}`);
    }
    if (filter.action) {
      params.push(filter.action);
      conditions.push(`action = $${params.length}`);
    }
    if (filter.entityType) {
      params.push(filter.entityType);
      conditions.push(`entity_type = $${params.length}`);
    }
    if (filter.entityId) {
      params.push(filter.entityId);
      conditions.push(`entity_id = $${params.length}`);
    }
    if (filter.dateFrom) {
      params.push(filter.dateFrom);
      conditions.push(`created_at >= $${params.length}`);
    }
    if (filter.dateTo) {
      params.push(filter.dateTo);
      conditions.push(`created_at <= $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (filter.page - 1) * filter.pageSize;

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM audit_logs ${whereClause}`,
      params,
    );

    const { rows } = await this.pool.query<AuditLogRow>(
      `SELECT * FROM audit_logs
       ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filter.pageSize, offset],
    );

    return { rows, total: Number(countResult.rows[0]?.count ?? '0') };
  }
}
