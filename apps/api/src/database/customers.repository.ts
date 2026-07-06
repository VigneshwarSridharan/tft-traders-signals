import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import type { CustomerSortField } from '@tft/shared';
import { PG_POOL } from './database.constants';
import type {
  CustomerFieldValueRow,
  CustomerRow,
  SuppressionFlagsRow,
} from './rows';

export interface CreateCustomerInput {
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  notes: string | null;
  trackingOptOut: boolean;
}

export interface UpdateCustomerInput {
  name?: string;
  company?: string | null;
  phone?: string | null;
  notes?: string | null;
  trackingOptOut?: boolean;
}

export interface CustomerListFilter {
  search?: string;
  sort: CustomerSortField;
  sortDir: 'asc' | 'desc';
  page: number;
  pageSize: number;
  tagId?: string;
}

const SORT_COLUMNS: Record<CustomerSortField, string> = {
  name: 'name',
  company: 'company',
  email: 'email',
  engagementScore: 'engagement_score',
  createdAt: 'created_at',
};

@Injectable()
export class CustomersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(
    filter: CustomerListFilter,
  ): Promise<{ rows: CustomerRow[]; total: number }> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];

    if (filter.search) {
      params.push(`%${filter.search}%`);
      conditions.push(
        `(name ILIKE $${params.length} OR company ILIKE $${params.length} OR email ILIKE $${params.length})`,
      );
    }

    if (filter.tagId) {
      params.push(filter.tagId);
      conditions.push(
        `EXISTS (
           SELECT 1 FROM taggings tg
           WHERE tg.entity_type = 'customer'
             AND tg.entity_id = customers.id
             AND tg.tag_id = $${params.length}
         )`,
      );
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const sortColumn = SORT_COLUMNS[filter.sort];
    const sortDir = filter.sortDir === 'desc' ? 'DESC' : 'ASC';
    const offset = (filter.page - 1) * filter.pageSize;

    const countResult = await this.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM customers ${whereClause}`,
      params,
    );

    const { rows } = await this.pool.query<CustomerRow>(
      `SELECT * FROM customers
       ${whereClause}
       ORDER BY ${sortColumn} ${sortDir}, id ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filter.pageSize, offset],
    );

    return { rows, total: Number(countResult.rows[0]?.count ?? '0') };
  }

  async listAll(): Promise<CustomerRow[]> {
    const { rows } = await this.pool.query<CustomerRow>(
      `SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY created_at ASC`,
    );
    return rows;
  }

  async findById(id: string): Promise<CustomerRow | null> {
    const { rows } = await this.pool.query<CustomerRow>(
      `SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findByEmail(email: string): Promise<CustomerRow | null> {
    const { rows } = await this.pool.query<CustomerRow>(
      `SELECT * FROM customers WHERE email = $1 AND deleted_at IS NULL`,
      [email],
    );
    return rows[0] ?? null;
  }

  async findByEmails(emails: string[]): Promise<Map<string, CustomerRow>> {
    if (emails.length === 0) {
      return new Map();
    }
    const { rows } = await this.pool.query<CustomerRow>(
      `SELECT * FROM customers WHERE email = ANY($1::text[]) AND deleted_at IS NULL`,
      [emails],
    );
    return new Map(rows.map((row) => [row.email.toLowerCase(), row]));
  }

  async create(input: CreateCustomerInput): Promise<CustomerRow> {
    const { rows } = await this.pool.query<CustomerRow>(
      `INSERT INTO customers (name, email, company, phone, notes, tracking_opt_out)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.name,
        input.email,
        input.company,
        input.phone,
        input.notes,
        input.trackingOptOut,
      ],
    );
    return rows[0];
  }

  async update(
    id: string,
    patch: UpdateCustomerInput,
  ): Promise<CustomerRow | null> {
    const { rows } = await this.pool.query<CustomerRow>(
      `UPDATE customers
       SET name = COALESCE($2, name),
           company = CASE WHEN $3 THEN $4 ELSE company END,
           phone = CASE WHEN $5 THEN $6 ELSE phone END,
           notes = CASE WHEN $7 THEN $8 ELSE notes END,
           tracking_opt_out = COALESCE($9, tracking_opt_out)
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [
        id,
        patch.name ?? null,
        'company' in patch,
        patch.company ?? null,
        'phone' in patch,
        patch.phone ?? null,
        'notes' in patch,
        patch.notes ?? null,
        patch.trackingOptOut ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async softDelete(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE customers SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
  }

  async getFieldValues(customerId: string): Promise<CustomerFieldValueRow[]> {
    const { rows } = await this.pool.query<CustomerFieldValueRow>(
      `SELECT * FROM customer_field_values WHERE customer_id = $1`,
      [customerId],
    );
    return rows;
  }

  async getFieldValuesForCustomers(
    customerIds: string[],
  ): Promise<Map<string, CustomerFieldValueRow[]>> {
    if (customerIds.length === 0) {
      return new Map();
    }
    const { rows } = await this.pool.query<CustomerFieldValueRow>(
      `SELECT * FROM customer_field_values WHERE customer_id = ANY($1::uuid[])`,
      [customerIds],
    );
    const map = new Map<string, CustomerFieldValueRow[]>();
    for (const row of rows) {
      const list = map.get(row.customer_id) ?? [];
      list.push(row);
      map.set(row.customer_id, list);
    }
    return map;
  }

  async setFieldValue(
    customerId: string,
    fieldDefId: string,
    value: string | null,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO customer_field_values (customer_id, field_def_id, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (customer_id, field_def_id)
       DO UPDATE SET value = EXCLUDED.value`,
      [customerId, fieldDefId, value],
    );
  }

  async getSuppressionFlags(
    emails: string[],
  ): Promise<Map<string, SuppressionFlagsRow>> {
    if (emails.length === 0) {
      return new Map();
    }
    const { rows } = await this.pool.query<SuppressionFlagsRow>(
      `SELECT email::text AS email,
              true AS suppressed,
              bool_or(reason = 'unsubscribe') AS unsubscribed
       FROM suppressions
       WHERE email = ANY($1::text[]) AND released_at IS NULL
       GROUP BY email`,
      [emails],
    );
    return new Map(rows.map((row) => [row.email.toLowerCase(), row]));
  }
}
