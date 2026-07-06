import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { Queryable } from './queryable';

export interface RecordAuditLogInput {
  userId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
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
}
