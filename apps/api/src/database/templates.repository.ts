import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { TemplateStatus } from '@tft/shared';
import { PG_POOL } from './database.constants';
import type { EmailTemplateRow, TemplateVersionRow } from './rows';

export interface TemplateListFilter {
  categoryId?: string;
  status?: TemplateStatus;
  search?: string;
}

export interface CreateTemplateInput {
  categoryId: string;
  name: string;
  createdBy: string | null;
}

export interface UpdateTemplateInput {
  name?: string;
  categoryId?: string;
  status?: TemplateStatus;
}

export interface CreateTemplateVersionInput {
  templateId: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  placeholders: string[];
  createdBy: string | null;
}

@Injectable()
export class TemplatesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(filter: TemplateListFilter): Promise<EmailTemplateRow[]> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];

    if (filter.categoryId) {
      params.push(filter.categoryId);
      conditions.push(`category_id = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filter.search) {
      params.push(`%${filter.search}%`);
      conditions.push(`name ILIKE $${params.length}`);
    }

    const { rows } = await this.pool.query<EmailTemplateRow>(
      `SELECT * FROM email_templates
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC`,
      params,
    );
    return rows;
  }

  async findById(id: string): Promise<EmailTemplateRow | null> {
    const { rows } = await this.pool.query<EmailTemplateRow>(
      `SELECT * FROM email_templates WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(input: CreateTemplateInput): Promise<EmailTemplateRow> {
    const { rows } = await this.pool.query<EmailTemplateRow>(
      `INSERT INTO email_templates (category_id, name, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.categoryId, input.name, input.createdBy],
    );
    return rows[0];
  }

  async update(
    id: string,
    patch: UpdateTemplateInput,
  ): Promise<EmailTemplateRow | null> {
    const { rows } = await this.pool.query<EmailTemplateRow>(
      `UPDATE email_templates
       SET name = COALESCE($2, name),
           category_id = COALESCE($3, category_id),
           status = COALESCE($4, status)
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, patch.name ?? null, patch.categoryId ?? null, patch.status ?? null],
    );
    return rows[0] ?? null;
  }

  async setCurrentVersion(
    templateId: string,
    versionId: string,
  ): Promise<EmailTemplateRow | null> {
    const { rows } = await this.pool.query<EmailTemplateRow>(
      `UPDATE email_templates
       SET current_version_id = $2
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [templateId, versionId],
    );
    return rows[0] ?? null;
  }

  async softDelete(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE email_templates SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
  }

  async createVersion(
    input: CreateTemplateVersionInput,
  ): Promise<TemplateVersionRow> {
    const { rows } = await this.pool.query<TemplateVersionRow>(
      `INSERT INTO template_versions
         (template_id, version_no, subject, body_html, body_text, placeholders, created_by)
       VALUES (
         $1,
         COALESCE((SELECT max(version_no) FROM template_versions WHERE template_id = $1), 0) + 1,
         $2, $3, $4, $5, $6
       )
       RETURNING *`,
      [
        input.templateId,
        input.subject,
        input.bodyHtml,
        input.bodyText,
        input.placeholders,
        input.createdBy,
      ],
    );
    return rows[0];
  }

  async findVersionById(id: string): Promise<TemplateVersionRow | null> {
    const { rows } = await this.pool.query<TemplateVersionRow>(
      `SELECT * FROM template_versions WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async listVersions(templateId: string): Promise<TemplateVersionRow[]> {
    const { rows } = await this.pool.query<TemplateVersionRow>(
      `SELECT * FROM template_versions WHERE template_id = $1 ORDER BY version_no DESC`,
      [templateId],
    );
    return rows;
  }

  async findCurrentVersionsByTemplateIds(
    versionIds: string[],
  ): Promise<Map<string, TemplateVersionRow>> {
    if (versionIds.length === 0) {
      return new Map();
    }
    const { rows } = await this.pool.query<TemplateVersionRow>(
      `SELECT * FROM template_versions WHERE id = ANY($1::uuid[])`,
      [versionIds],
    );
    return new Map(rows.map((row) => [row.id, row]));
  }

  async findTemplateNamesForVersionIds(
    versionIds: string[],
  ): Promise<Map<string, { templateId: string; templateName: string }>> {
    if (versionIds.length === 0) {
      return new Map();
    }
    const { rows } = await this.pool.query<{
      version_id: string;
      template_id: string;
      template_name: string;
    }>(
      `SELECT tv.id AS version_id, tv.template_id, t.name AS template_name
       FROM template_versions tv
       JOIN email_templates t ON t.id = tv.template_id
       WHERE tv.id = ANY($1::uuid[])`,
      [versionIds],
    );
    return new Map(
      rows.map((row) => [
        row.version_id,
        { templateId: row.template_id, templateName: row.template_name },
      ]),
    );
  }
}
