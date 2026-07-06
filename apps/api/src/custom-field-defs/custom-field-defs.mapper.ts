import type { CustomFieldDefSummary } from '@tft/shared';
import type { CustomFieldDefRow } from '../database/rows';

export function toCustomFieldDefSummary(
  row: CustomFieldDefRow,
): CustomFieldDefSummary {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    fieldType: row.field_type,
    createdAt: row.created_at.toISOString(),
  };
}
