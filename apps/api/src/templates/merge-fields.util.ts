import type { CustomFieldDefRow } from '../database/rows';
import type { MergeFieldOption } from '@tft/shared';

const STATIC_MERGE_FIELDS: MergeFieldOption[] = [
  { key: 'customer.name', label: 'Customer name', group: 'customer' },
  { key: 'customer.company', label: 'Customer company', group: 'customer' },
  { key: 'customer.email', label: 'Customer email', group: 'customer' },
  { key: 'customer.phone', label: 'Customer phone', group: 'customer' },
  { key: 'sender.name', label: 'Sender name', group: 'sender' },
  { key: 'sender.signature', label: 'Sender signature', group: 'sender' },
  { key: 'quotation.number', label: 'Quotation number', group: 'other' },
  { key: 'product.name', label: 'Product name', group: 'other' },
  { key: 'product.price', label: 'Product price', group: 'other' },
];

export function buildMergeFieldOptions(
  customFieldDefs: CustomFieldDefRow[],
): MergeFieldOption[] {
  const customFieldOptions: MergeFieldOption[] = customFieldDefs.map((def) => ({
    key: `customer.${def.key}`,
    label: def.label,
    group: 'customer',
  }));
  return [...STATIC_MERGE_FIELDS, ...customFieldOptions];
}

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function extractPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    found.add(match[1]);
  }
  return [...found];
}

export function classifyPlaceholders(
  placeholders: string[],
  knownKeys: ReadonlySet<string>,
): { known: string[]; unknown: string[] } {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const placeholder of placeholders) {
    if (knownKeys.has(placeholder)) {
      known.push(placeholder);
    } else {
      unknown.push(placeholder);
    }
  }
  return { known, unknown };
}

export function renderMergeFields(
  text: string,
  values: ReadonlyMap<string, string>,
): { rendered: string; unresolved: string[] } {
  const unresolved = new Set<string>();
  const rendered = text.replace(PLACEHOLDER_PATTERN, (full, key: string) => {
    if (values.has(key)) {
      return values.get(key) ?? '';
    }
    unresolved.add(key);
    return full;
  });
  return { rendered, unresolved: [...unresolved] };
}
