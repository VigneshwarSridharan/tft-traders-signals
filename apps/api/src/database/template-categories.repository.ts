import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { PG_POOL } from './database.constants';
import type { TemplateCategoryRow } from './rows';

export interface UpdateTemplateCategoryInput {
  name?: string;
  defaultTemplateId?: string | null;
}

@Injectable()
export class TemplateCategoriesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(): Promise<TemplateCategoryRow[]> {
    const { rows } = await this.pool.query<TemplateCategoryRow>(
      `SELECT * FROM template_categories ORDER BY name ASC`,
    );
    return rows;
  }

  async findById(id: string): Promise<TemplateCategoryRow | null> {
    const { rows } = await this.pool.query<TemplateCategoryRow>(
      `SELECT * FROM template_categories WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByName(name: string): Promise<TemplateCategoryRow | null> {
    const { rows } = await this.pool.query<TemplateCategoryRow>(
      `SELECT * FROM template_categories WHERE name = $1`,
      [name],
    );
    return rows[0] ?? null;
  }

  async create(name: string): Promise<TemplateCategoryRow> {
    const { rows } = await this.pool.query<TemplateCategoryRow>(
      `INSERT INTO template_categories (name) VALUES ($1) RETURNING *`,
      [name],
    );
    return rows[0];
  }

  async update(
    id: string,
    patch: UpdateTemplateCategoryInput,
  ): Promise<TemplateCategoryRow | null> {
    const { rows } = await this.pool.query<TemplateCategoryRow>(
      `UPDATE template_categories
       SET name = COALESCE($2, name),
           default_template_id = CASE WHEN $3 THEN $4 ELSE default_template_id END
       WHERE id = $1
       RETURNING *`,
      [
        id,
        patch.name ?? null,
        'defaultTemplateId' in patch,
        patch.defaultTemplateId ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM template_categories WHERE id = $1`, [
      id,
    ]);
  }
}
