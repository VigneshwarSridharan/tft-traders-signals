import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import type {
  CsvImportResult,
  CsvImportRowError,
  CustomerListResponse,
  CustomerSummary,
} from '@tft/shared';
import { CustomFieldDefsRepository } from '../database/custom-field-defs.repository';
import { CustomersRepository } from '../database/customers.repository';
import type { CustomerRow, TagRow } from '../database/rows';
import { TagsRepository } from '../database/tags.repository';
import { validateCustomFieldValue } from './custom-field-value.util';
import { parseCsv, toCsvRow } from './csv.util';
import { toCustomerSummary } from './customers.mapper';
import type {
  CreateCustomerDto,
  CustomerListQueryDto,
  UpdateCustomerDto,
} from './dto/customers.schemas';

const emailSchema = z.string().email();

@Injectable()
export class CustomersService {
  constructor(
    private readonly customersRepository: CustomersRepository,
    private readonly customFieldDefsRepository: CustomFieldDefsRepository,
    private readonly tagsRepository: TagsRepository,
  ) {}

  async list(query: CustomerListQueryDto): Promise<CustomerListResponse> {
    const { rows, total } = await this.customersRepository.list({
      search: query.search,
      sort: query.sort,
      sortDir: query.sortDir,
      page: query.page,
      pageSize: query.pageSize,
      tagId: query.tagId,
    });

    return {
      items: await this.toSummaries(rows),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<CustomerSummary> {
    const row = await this.customersRepository.findById(id);
    if (!row) {
      throw new NotFoundException('Customer not found');
    }
    const [summary] = await this.toSummaries([row]);
    return summary;
  }

  async create(input: CreateCustomerDto): Promise<CustomerSummary> {
    const existing = await this.customersRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictException('A customer with this email already exists');
    }

    const row = await this.customersRepository.create({
      name: input.name,
      email: input.email,
      company: input.company ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      trackingOptOut: input.trackingOptOut ?? false,
    });

    if (input.customFields) {
      await this.applyCustomFields(row.id, input.customFields);
    }

    if (input.tagIds) {
      for (const tagId of input.tagIds) {
        await this.assertTagExists(tagId);
        await this.tagsRepository.addTagging(tagId, 'customer', row.id);
      }
    }

    const [summary] = await this.toSummaries([row]);
    return summary;
  }

  async update(id: string, patch: UpdateCustomerDto): Promise<CustomerSummary> {
    const existing = await this.customersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Customer not found');
    }

    const { customFields, ...rest } = patch;
    const updated = await this.customersRepository.update(id, rest);
    if (!updated) {
      throw new NotFoundException('Customer not found');
    }

    if (customFields) {
      await this.applyCustomFields(id, customFields);
    }

    const [summary] = await this.toSummaries([updated]);
    return summary;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.customersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Customer not found');
    }
    await this.customersRepository.softDelete(id);
  }

  async addTag(id: string, tagId: string): Promise<CustomerSummary> {
    const existing = await this.customersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Customer not found');
    }
    await this.assertTagExists(tagId);
    await this.tagsRepository.addTagging(tagId, 'customer', id);
    const [summary] = await this.toSummaries([existing]);
    return summary;
  }

  async removeTag(id: string, tagId: string): Promise<CustomerSummary> {
    const existing = await this.customersRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Customer not found');
    }
    await this.tagsRepository.removeTagging(tagId, 'customer', id);
    const [summary] = await this.toSummaries([existing]);
    return summary;
  }

  async exportCsv(): Promise<string> {
    const rows = await this.customersRepository.listAll();
    const fieldDefs = await this.customFieldDefsRepository.list();
    const fieldValuesByCustomer =
      await this.customersRepository.getFieldValuesForCustomers(
        rows.map((row) => row.id),
      );

    const headers = [
      'name',
      'email',
      'company',
      'phone',
      'notes',
      'tracking_opt_out',
      ...fieldDefs.map((def) => def.key),
    ];
    const lines = [toCsvRow(headers)];

    for (const row of rows) {
      const values = fieldValuesByCustomer.get(row.id) ?? [];
      const valueByFieldDefId = new Map(
        values.map((value) => [value.field_def_id, value.value ?? '']),
      );
      lines.push(
        toCsvRow([
          row.name,
          row.email,
          row.company ?? '',
          row.phone ?? '',
          row.notes ?? '',
          row.tracking_opt_out ? 'true' : 'false',
          ...fieldDefs.map((def) => valueByFieldDefId.get(def.id) ?? ''),
        ]),
      );
    }

    return lines.join('\n');
  }

  async importCsv(csvText: string): Promise<CsvImportResult> {
    const { headers, rows } = parseCsv(csvText);
    const nameIdx = headers.indexOf('name');
    const emailIdx = headers.indexOf('email');
    if (nameIdx === -1 || emailIdx === -1) {
      throw new BadRequestException(
        'CSV must include "name" and "email" columns',
      );
    }
    const companyIdx = headers.indexOf('company');
    const phoneIdx = headers.indexOf('phone');
    const notesIdx = headers.indexOf('notes');
    const trackingOptOutIdx = headers.indexOf('tracking_opt_out');

    const fieldDefs = await this.customFieldDefsRepository.list();
    const customFieldColumns = headers
      .map((header, index) => ({ header, index }))
      .filter(({ header }) => fieldDefs.some((def) => def.key === header));

    const emailsInFile = rows
      .map((cols) => cols[emailIdx]?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email));
    const existingByEmail =
      await this.customersRepository.findByEmails(emailsInFile);

    const errors: CsvImportRowError[] = [];
    const seenEmails = new Set<string>();
    let imported = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const rowNum = i + 2;
      const cols = rows[i];
      const name = cols[nameIdx]?.trim() ?? '';
      const email = cols[emailIdx]?.trim() ?? '';
      const emailLower = email.toLowerCase();

      if (!name) {
        errors.push({
          row: rowNum,
          email: email || null,
          reason: 'Missing name',
        });
        continue;
      }
      if (!email || !emailSchema.safeParse(email).success) {
        errors.push({
          row: rowNum,
          email: email || null,
          reason: 'Invalid email',
        });
        continue;
      }
      if (seenEmails.has(emailLower)) {
        errors.push({ row: rowNum, email, reason: 'Duplicate email in file' });
        continue;
      }
      if (existingByEmail.has(emailLower)) {
        errors.push({
          row: rowNum,
          email,
          reason: 'Customer with this email already exists',
        });
        continue;
      }

      const created = await this.customersRepository.create({
        name,
        email,
        company: companyIdx >= 0 ? cols[companyIdx]?.trim() || null : null,
        phone: phoneIdx >= 0 ? cols[phoneIdx]?.trim() || null : null,
        notes: notesIdx >= 0 ? cols[notesIdx]?.trim() || null : null,
        trackingOptOut:
          trackingOptOutIdx >= 0
            ? ['true', '1', 'yes'].includes(
                (cols[trackingOptOutIdx]?.trim() ?? '').toLowerCase(),
              )
            : false,
      });

      for (const { header, index } of customFieldColumns) {
        const value = cols[index]?.trim();
        if (value) {
          const def = fieldDefs.find((d) => d.key === header);
          if (def) {
            await this.customersRepository.setFieldValue(
              created.id,
              def.id,
              value,
            );
          }
        }
      }

      seenEmails.add(emailLower);
      imported += 1;
    }

    return { imported, skipped: errors.length, errors };
  }

  private async assertTagExists(tagId: string): Promise<TagRow> {
    const tag = await this.tagsRepository.findById(tagId);
    if (!tag) {
      throw new NotFoundException(`Tag ${tagId} not found`);
    }
    return tag;
  }

  private async applyCustomFields(
    customerId: string,
    customFields: Record<string, string | null>,
  ): Promise<void> {
    const fieldDefs = await this.customFieldDefsRepository.list();
    const fieldDefByKey = new Map(fieldDefs.map((def) => [def.key, def]));

    for (const [key, value] of Object.entries(customFields)) {
      const def = fieldDefByKey.get(key);
      if (!def) {
        throw new BadRequestException(`Unknown custom field "${key}"`);
      }
      if (value !== null) {
        validateCustomFieldValue(def.field_type, key, value);
      }
      await this.customersRepository.setFieldValue(customerId, def.id, value);
    }
  }

  private async toSummaries(rows: CustomerRow[]): Promise<CustomerSummary[]> {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);
    const emails = rows.map((row) => row.email);

    const [tagsByCustomer, fieldValuesByCustomer, fieldDefs, suppressionFlags] =
      await Promise.all([
        this.tagsRepository.listForEntities('customer', ids),
        this.customersRepository.getFieldValuesForCustomers(ids),
        this.customFieldDefsRepository.list(),
        this.customersRepository.getSuppressionFlags(emails),
      ]);

    const fieldKeyById = new Map(fieldDefs.map((def) => [def.id, def.key]));

    return rows.map((row) =>
      toCustomerSummary(
        row,
        tagsByCustomer.get(row.id) ?? [],
        fieldValuesByCustomer.get(row.id) ?? [],
        fieldKeyById,
        suppressionFlags.get(row.email.toLowerCase()),
      ),
    );
  }
}
