import type {
  CustomFieldDefRow,
  CustomerFieldValueRow,
  CustomerRow,
  SenderAccountRow,
} from '../database/rows';
import { applyCustomerValues } from '../templates/sample-data.util';

export function buildComposeMergeValues(
  sender: SenderAccountRow,
  customer: CustomerRow,
  fieldValues: CustomerFieldValueRow[],
  fieldDefsById: Map<string, CustomFieldDefRow>,
  fallbackValues: Record<string, string> | undefined,
): Map<string, string> {
  const values = new Map<string, string>();
  values.set('sender.name', sender.display_name ?? sender.email);
  values.set('sender.signature', sender.signature_html ?? '');

  if (fallbackValues) {
    for (const [key, value] of Object.entries(fallbackValues)) {
      values.set(key, value);
    }
  }

  applyCustomerValues(values, customer, fieldValues, fieldDefsById);
  return values;
}
