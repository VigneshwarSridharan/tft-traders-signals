import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { Queryable } from './queryable';
import type { TagRow } from './rows';

export interface CreateTagInput {
  name: string;
  color: string | null;
}

export interface UpdateTagInput {
  name?: string;
  color?: string | null;
}

@Injectable()
export class TagsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(): Promise<TagRow[]> {
    const { rows } = await this.pool.query<TagRow>(
      `SELECT * FROM tags ORDER BY name ASC`,
    );
    return rows;
  }

  async findById(id: string): Promise<TagRow | null> {
    const { rows } = await this.pool.query<TagRow>(
      `SELECT * FROM tags WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByName(name: string): Promise<TagRow | null> {
    const { rows } = await this.pool.query<TagRow>(
      `SELECT * FROM tags WHERE name = $1`,
      [name],
    );
    return rows[0] ?? null;
  }

  async create(input: CreateTagInput): Promise<TagRow> {
    const { rows } = await this.pool.query<TagRow>(
      `INSERT INTO tags (name, color) VALUES ($1, $2) RETURNING *`,
      [input.name, input.color],
    );
    return rows[0];
  }

  async update(id: string, patch: UpdateTagInput): Promise<TagRow | null> {
    const { rows } = await this.pool.query<TagRow>(
      `UPDATE tags
       SET name = COALESCE($2, name),
           color = CASE WHEN $3 THEN $4 ELSE color END
       WHERE id = $1
       RETURNING *`,
      [id, patch.name ?? null, 'color' in patch, patch.color ?? null],
    );
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM tags WHERE id = $1`, [id]);
  }

  async listForEntity(
    entityType: 'customer' | 'message' | 'template',
    entityId: string,
  ): Promise<TagRow[]> {
    const { rows } = await this.pool.query<TagRow>(
      `SELECT t.*
       FROM tags t
       JOIN taggings tg ON tg.tag_id = t.id
       WHERE tg.entity_type = $1 AND tg.entity_id = $2
       ORDER BY t.name ASC`,
      [entityType, entityId],
    );
    return rows;
  }

  async listForEntities(
    entityType: 'customer' | 'message' | 'template',
    entityIds: string[],
  ): Promise<Map<string, TagRow[]>> {
    if (entityIds.length === 0) {
      return new Map();
    }
    const { rows } = await this.pool.query<TagRow & { entity_id: string }>(
      `SELECT t.*, tg.entity_id
       FROM tags t
       JOIN taggings tg ON tg.tag_id = t.id
       WHERE tg.entity_type = $1 AND tg.entity_id = ANY($2::uuid[])
       ORDER BY t.name ASC`,
      [entityType, entityIds],
    );
    const map = new Map<string, TagRow[]>();
    for (const row of rows) {
      const { entity_id, ...tag } = row;
      const list = map.get(entity_id) ?? [];
      list.push(tag);
      map.set(entity_id, list);
    }
    return map;
  }

  async addTagging(
    tagId: string,
    entityType: 'customer' | 'message' | 'template',
    entityId: string,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO taggings (tag_id, entity_type, entity_id)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [tagId, entityType, entityId],
    );
  }

  async removeTagging(
    tagId: string,
    entityType: 'customer' | 'message' | 'template',
    entityId: string,
  ): Promise<void> {
    await this.pool.query(
      `DELETE FROM taggings
       WHERE tag_id = $1 AND entity_type = $2 AND entity_id = $3`,
      [tagId, entityType, entityId],
    );
  }

  /** Used by GDPR erasure — taggings have no FK to their entity, so they don't auto-clean on delete. */
  async removeAllTaggingsForEntity(
    entityType: 'customer' | 'message' | 'template',
    entityId: string,
    executor: Queryable = this.pool,
  ): Promise<void> {
    await executor.query(
      `DELETE FROM taggings WHERE entity_type = $1 AND entity_id = $2`,
      [entityType, entityId],
    );
  }
}
