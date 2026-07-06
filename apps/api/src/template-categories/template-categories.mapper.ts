import type { TemplateCategorySummary } from '@tft/shared';
import type { TemplateCategoryRow } from '../database/rows';

export function toTemplateCategorySummary(
  row: TemplateCategoryRow,
): TemplateCategorySummary {
  return {
    id: row.id,
    name: row.name,
    defaultTemplateId: row.default_template_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
