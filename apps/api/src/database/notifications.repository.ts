import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { NotificationType } from '@tft/shared';
import { PG_POOL } from './database.constants';
import type { NotificationRow } from './rows';
import type { Queryable } from './queryable';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string | null;
  messageId: string | null;
}

export interface ListNotificationsOptions {
  unreadOnly?: boolean;
  limit?: number;
}

@Injectable()
export class NotificationsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(
    input: CreateNotificationInput,
    executor: Queryable = this.pool,
  ): Promise<NotificationRow> {
    const { rows } = await executor.query<NotificationRow>(
      `INSERT INTO notifications (user_id, type, message_id, title, body)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [input.userId, input.type, input.messageId, input.title, input.body],
    );
    return rows[0];
  }

  async listForUser(
    userId: string,
    options: ListNotificationsOptions = {},
  ): Promise<NotificationRow[]> {
    const limit = options.limit ?? 50;
    const { rows } = await this.pool.query<NotificationRow>(
      `SELECT * FROM notifications
       WHERE user_id = $1 ${options.unreadOnly ? 'AND read_at IS NULL' : ''}
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return rows;
  }

  async countUnread(userId: string): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return Number(rows[0]?.count ?? '0');
  }

  async markRead(id: string, userId: string): Promise<NotificationRow | null> {
    const { rows } = await this.pool.query<NotificationRow>(
      `UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId],
    );
    return rows[0] ?? null;
  }

  async markAllRead(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
  }
}
