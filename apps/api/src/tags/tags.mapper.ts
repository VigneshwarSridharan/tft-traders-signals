import type { TagSummary } from '@tft/shared';
import type { TagRow } from '../database/rows';

export function toTagSummary(row: TagRow): TagSummary {
  return { id: row.id, name: row.name, color: row.color };
}
