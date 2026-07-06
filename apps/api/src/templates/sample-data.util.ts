import type { CustomFieldDefRow, CustomerRow } from '../database/rows';

export function buildDefaultSampleValues(
  customFieldDefs: CustomFieldDefRow[],
): Map<string, string> {
  const values = new Map<string, string>([
    ['customer.name', 'Sample Customer'],
    ['customer.company', 'Sample Company'],
    ['customer.email', 'sample@example.com'],
    ['customer.phone', '+1 555-0100'],
    ['sender.name', 'Your Company'],
    ['sender.signature', 'Best regards,<br/>The Team'],
    ['quotation.number', 'Q-1001'],
    ['product.name', 'Sample Product'],
    ['product.price', '$100.00'],
  ]);
  for (const def of customFieldDefs) {
    values.set(`customer.${def.key}`, `Sample ${def.label}`);
  }
  return values;
}

export function applyCustomerValues(
  values: Map<string, string>,
  customer: CustomerRow,
  fieldValues: { field_def_id: string; value: string | null }[],
  fieldDefsById: Map<string, CustomFieldDefRow>,
): void {
  values.set('customer.name', customer.name);
  values.set('customer.company', customer.company ?? '');
  values.set('customer.email', customer.email);
  values.set('customer.phone', customer.phone ?? '');
  for (const fieldValue of fieldValues) {
    const def = fieldDefsById.get(fieldValue.field_def_id);
    if (def && fieldValue.value !== null) {
      values.set(`customer.${def.key}`, fieldValue.value);
    }
  }
}
