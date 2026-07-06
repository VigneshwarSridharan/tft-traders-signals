import type { CustomerSummary } from '@tft/shared';
import type {
  CustomerFieldValueRow,
  CustomerRow,
  SuppressionFlagsRow,
  TagRow,
} from '../database/rows';

export function toCustomerSummary(
  row: CustomerRow,
  tags: TagRow[],
  fieldValues: CustomerFieldValueRow[],
  fieldKeyById: Map<string, string>,
  suppression: SuppressionFlagsRow | undefined,
): CustomerSummary {
  const customFields: Record<string, string | null> = {};
  for (const fieldValue of fieldValues) {
    const key = fieldKeyById.get(fieldValue.field_def_id);
    if (key) {
      customFields[key] = fieldValue.value;
    }
  }

  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    trackingOptOut: row.tracking_opt_out,
    unsubscribed: suppression?.unsubscribed ?? false,
    suppressed: suppression?.suppressed ?? false,
    engagementScore: row.engagement_score,
    tags: tags.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color })),
    customFields,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
