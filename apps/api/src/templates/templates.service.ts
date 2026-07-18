import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type {
  EmailTemplateSummary,
  MergeFieldOption,
  TemplatePreviewResponse,
  TemplateVersionSummary,
  TestSendTemplateResponse,
} from '@tft/shared';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { CustomFieldDefsRepository } from '../database/custom-field-defs.repository';
import { CustomersRepository } from '../database/customers.repository';
import type { EmailTemplateRow } from '../database/rows';
import { TemplateCategoriesRepository } from '../database/template-categories.repository';
import { TemplatesRepository } from '../database/templates.repository';
import {
  buildMergeFieldOptions,
  classifyPlaceholders,
  extractPlaceholders,
  renderMergeFields,
} from './merge-fields.util';
import {
  applyCustomerValues,
  buildDefaultSampleValues,
} from './sample-data.util';
import { htmlToPlainText, sanitizeTemplateHtml } from './sanitize.util';
import {
  toTemplateSummary,
  toTemplateVersionSummary,
} from './templates.mapper';
import type {
  CreateTemplateDto,
  TemplateListQueryDto,
  TemplatePreviewDto,
  UpdateTemplateDto,
} from './dto/templates.schemas';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly templatesRepository: TemplatesRepository,
    private readonly templateCategoriesRepository: TemplateCategoriesRepository,
    private readonly customFieldDefsRepository: CustomFieldDefsRepository,
    private readonly customersRepository: CustomersRepository,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  async list(query: TemplateListQueryDto): Promise<EmailTemplateSummary[]> {
    const rows = await this.templatesRepository.list(query);
    return this.toSummaries(rows);
  }

  async get(id: string): Promise<EmailTemplateSummary> {
    const row = await this.getTemplateOrThrow(id);
    const [summary] = await this.toSummaries([row]);
    return summary;
  }

  async listVersions(id: string): Promise<TemplateVersionSummary[]> {
    await this.getTemplateOrThrow(id);
    const versions = await this.templatesRepository.listVersions(id);
    const knownKeys = await this.knownMergeFieldKeys();
    return versions.map((version) => {
      const { unknown } = classifyPlaceholders(version.placeholders, knownKeys);
      return toTemplateVersionSummary(version, unknown);
    });
  }

  async create(
    input: CreateTemplateDto,
    userId: string | null,
  ): Promise<EmailTemplateSummary> {
    const category = await this.templateCategoriesRepository.findById(
      input.categoryId,
    );
    if (!category) {
      throw new BadRequestException('Unknown category');
    }

    const template = await this.templatesRepository.create({
      categoryId: input.categoryId,
      name: input.name,
      createdBy: userId,
    });

    await this.saveVersion(
      template,
      {
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText ?? null,
      },
      userId,
    );

    const refreshed = await this.getTemplateOrThrow(template.id);
    const [summary] = await this.toSummaries([refreshed]);

    await this.auditLogsRepository.record({
      userId,
      action: 'template.create',
      entityType: 'template',
      entityId: template.id,
      metadata: { name: template.name },
    });

    return summary;
  }

  async update(
    id: string,
    patch: UpdateTemplateDto,
    userId: string | null,
  ): Promise<EmailTemplateSummary> {
    await this.getTemplateOrThrow(id);

    if (patch.categoryId) {
      const category = await this.templateCategoriesRepository.findById(
        patch.categoryId,
      );
      if (!category) {
        throw new BadRequestException('Unknown category');
      }
    }

    const updated = await this.templatesRepository.update(id, patch);
    if (!updated) {
      throw new NotFoundException('Template not found');
    }
    const [summary] = await this.toSummaries([updated]);

    await this.auditLogsRepository.record({
      userId,
      action: 'template.update',
      entityType: 'template',
      entityId: id,
      metadata: { fields: Object.keys(patch) },
    });

    return summary;
  }

  async saveNewVersion(
    id: string,
    input: { subject: string; bodyHtml: string; bodyText?: string | null },
    userId: string | null,
  ): Promise<EmailTemplateSummary> {
    const template = await this.getTemplateOrThrow(id);
    await this.saveVersion(
      template,
      {
        subject: input.subject,
        bodyHtml: input.bodyHtml,
        bodyText: input.bodyText ?? null,
      },
      userId,
    );
    const refreshed = await this.getTemplateOrThrow(id);
    const [summary] = await this.toSummaries([refreshed]);

    await this.auditLogsRepository.record({
      userId,
      action: 'template.version_create',
      entityType: 'template',
      entityId: id,
      metadata: { subject: input.subject },
    });

    return summary;
  }

  async duplicate(
    id: string,
    userId: string | null,
  ): Promise<EmailTemplateSummary> {
    const template = await this.getTemplateOrThrow(id);
    if (!template.current_version_id) {
      throw new BadRequestException('Template has no content to duplicate');
    }
    const currentVersion = await this.templatesRepository.findVersionById(
      template.current_version_id,
    );
    if (!currentVersion) {
      throw new BadRequestException('Template has no content to duplicate');
    }

    const copy = await this.templatesRepository.create({
      categoryId: template.category_id,
      name: `${template.name} (Copy)`,
      createdBy: userId,
    });

    await this.saveVersion(
      copy,
      {
        subject: currentVersion.subject,
        bodyHtml: currentVersion.body_html,
        bodyText: currentVersion.body_text,
      },
      userId,
    );

    const refreshed = await this.getTemplateOrThrow(copy.id);
    const [summary] = await this.toSummaries([refreshed]);

    await this.auditLogsRepository.record({
      userId,
      action: 'template.duplicate',
      entityType: 'template',
      entityId: copy.id,
      metadata: { sourceTemplateId: id },
    });

    return summary;
  }

  async delete(id: string, userId: string | null): Promise<void> {
    await this.getTemplateOrThrow(id);
    await this.templatesRepository.softDelete(id);
    await this.auditLogsRepository.record({
      userId,
      action: 'template.delete',
      entityType: 'template',
      entityId: id,
      metadata: {},
    });
  }

  async mergeFields(): Promise<MergeFieldOption[]> {
    const customFieldDefs = await this.customFieldDefsRepository.list();
    return buildMergeFieldOptions(customFieldDefs);
  }

  async preview(
    id: string | null,
    request: TemplatePreviewDto,
  ): Promise<TemplatePreviewResponse> {
    let subject = request.subject;
    let bodyHtml = request.bodyHtml;
    let bodyText = request.bodyText ?? null;

    if (subject === undefined || bodyHtml === undefined) {
      if (!id) {
        throw new BadRequestException(
          'subject and bodyHtml are required when no template id is given',
        );
      }
      const template = await this.getTemplateOrThrow(id);
      if (!template.current_version_id) {
        throw new BadRequestException('Template has no content to preview');
      }
      const version = await this.templatesRepository.findVersionById(
        template.current_version_id,
      );
      if (!version) {
        throw new BadRequestException('Template has no content to preview');
      }
      subject = subject ?? version.subject;
      bodyHtml = bodyHtml ?? version.body_html;
      bodyText = bodyText ?? version.body_text;
    }

    const customFieldDefs = await this.customFieldDefsRepository.list();
    const values = buildDefaultSampleValues(customFieldDefs);

    if (request.customerId) {
      const customer = await this.customersRepository.findById(
        request.customerId,
      );
      if (!customer) {
        throw new BadRequestException('Unknown customer');
      }
      const fieldValues = await this.customersRepository.getFieldValues(
        customer.id,
      );
      const fieldDefsById = new Map(
        customFieldDefs.map((def) => [def.id, def]),
      );
      applyCustomerValues(values, customer, fieldValues, fieldDefsById);
    }

    if (request.sampleData) {
      for (const [key, value] of Object.entries(request.sampleData)) {
        values.set(key, value);
      }
    }

    const subjectResult = renderMergeFields(subject, values);
    const bodyResult = renderMergeFields(bodyHtml, values);
    const bodyTextResult = bodyText
      ? renderMergeFields(bodyText, values)
      : null;

    const placeholders = extractPlaceholders(`${subject} ${bodyHtml}`);
    const unresolvedPlaceholders = [
      ...new Set([
        ...subjectResult.unresolved,
        ...bodyResult.unresolved,
        ...(bodyTextResult?.unresolved ?? []),
      ]),
    ];

    return {
      subject: subjectResult.rendered,
      bodyHtml: bodyResult.rendered,
      bodyText: bodyTextResult?.rendered ?? null,
      placeholders,
      unresolvedPlaceholders,
    };
  }

  async testSend(id: string, to: string): Promise<TestSendTemplateResponse> {
    const template = await this.getTemplateOrThrow(id);
    if (!template.current_version_id) {
      throw new BadRequestException('Template has no content to send');
    }
    return { accepted: true, to, stub: true };
  }

  private async saveVersion(
    template: EmailTemplateRow,
    input: { subject: string; bodyHtml: string; bodyText: string | null },
    userId: string | null,
  ): Promise<void> {
    const bodyHtml = sanitizeTemplateHtml(input.bodyHtml);
    const bodyText = input.bodyText?.trim() || htmlToPlainText(bodyHtml);
    const placeholders = extractPlaceholders(`${input.subject} ${bodyHtml}`);

    const version = await this.templatesRepository.createVersion({
      templateId: template.id,
      subject: input.subject,
      bodyHtml,
      bodyText,
      placeholders,
      createdBy: userId,
    });

    await this.templatesRepository.setCurrentVersion(template.id, version.id);
  }

  private async getTemplateOrThrow(id: string): Promise<EmailTemplateRow> {
    const row = await this.templatesRepository.findById(id);
    if (!row) {
      throw new NotFoundException('Template not found');
    }
    return row;
  }

  private async knownMergeFieldKeys(): Promise<Set<string>> {
    const options = await this.mergeFields();
    return new Set(options.map((option) => option.key));
  }

  private async toSummaries(
    rows: EmailTemplateRow[],
  ): Promise<EmailTemplateSummary[]> {
    if (rows.length === 0) {
      return [];
    }
    const categories = await this.templateCategoriesRepository.list();
    const categoryNameById = new Map(
      categories.map((category) => [category.id, category.name]),
    );

    const versionIds = rows
      .map((row) => row.current_version_id)
      .filter((versionId): versionId is string => Boolean(versionId));
    const versionsById =
      await this.templatesRepository.findCurrentVersionsByTemplateIds(
        versionIds,
      );
    const knownKeys = await this.knownMergeFieldKeys();

    return rows.map((row) => {
      const version = row.current_version_id
        ? (versionsById.get(row.current_version_id) ?? null)
        : null;
      const versionSummary = version
        ? toTemplateVersionSummary(
            version,
            classifyPlaceholders(version.placeholders, knownKeys).unknown,
          )
        : null;
      return toTemplateSummary(
        row,
        categoryNameById.get(row.category_id) ?? 'Unknown',
        versionSummary,
      );
    });
  }
}
