import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { CustomFieldType } from '@tft/shared';
import { PG_POOL } from './database.constants';
import type { CustomFieldDefRow } from './rows';

export interface CreateCustomFieldDefInput {
  key: string;
  label: string;
  fieldType: CustomFieldType;
}

export interface UpdateCustomFieldDefInput {
  label?: string;
  fieldType?: CustomFieldType;
}

@Injectable()
export class CustomFieldDefsRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(): Promise<CustomFieldDefRow[]> {
    const { rows } = await this.pool.query<CustomFieldDefRow>(
      `SELECT * FROM custom_field_defs ORDER BY created_at ASC`,
    );
    return rows;
  }

  async findById(id: string): Promise<CustomFieldDefRow | null> {
    const { rows } = await this.pool.query<CustomFieldDefRow>(
      `SELECT * FROM custom_field_defs WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByKey(key: string): Promise<CustomFieldDefRow | null> {
    const { rows } = await this.pool.query<CustomFieldDefRow>(
      `SELECT * FROM custom_field_defs WHERE key = $1`,
      [key],
    );
    return rows[0] ?? null;
  }

  async create(input: CreateCustomFieldDefInput): Promise<CustomFieldDefRow> {
    const { rows } = await this.pool.query<CustomFieldDefRow>(
      `INSERT INTO custom_field_defs (key, label, field_type)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.key, input.label, input.fieldType],
    );
    return rows[0];
  }

  async update(
    id: string,
    patch: UpdateCustomFieldDefInput,
  ): Promise<CustomFieldDefRow | null> {
    const { rows } = await this.pool.query<CustomFieldDefRow>(
      `UPDATE custom_field_defs
       SET label = COALESCE($2, label),
           field_type = COALESCE($3, field_type)
       WHERE id = $1
       RETURNING *`,
      [id, patch.label ?? null, patch.fieldType ?? null],
    );
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM custom_field_defs WHERE id = $1`, [id]);
  }
}
