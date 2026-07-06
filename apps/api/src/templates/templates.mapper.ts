import type { EmailTemplateSummary, TemplateVersionSummary } from '@tft/shared';
import type { EmailTemplateRow, TemplateVersionRow } from '../database/rows';

export function toTemplateVersionSummary(
  row: TemplateVersionRow,
  unknownPlaceholders: string[],
): TemplateVersionSummary {
  return {
    id: row.id,
    templateId: row.template_id,
    versionNo: row.version_no,
    subject: row.subject,
    bodyHtml: row.body_html,
    bodyText: row.body_text,
    placeholders: row.placeholders,
    unknownPlaceholders,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

export function toTemplateSummary(
  row: EmailTemplateRow,
  categoryName: string,
  currentVersion: TemplateVersionSummary | null,
): EmailTemplateSummary {
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryName,
    name: row.name,
    status: row.status,
    currentVersion,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
