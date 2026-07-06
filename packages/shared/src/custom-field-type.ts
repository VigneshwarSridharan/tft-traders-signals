export const CUSTOM_FIELD_TYPES = ["text", "number", "date", "url"] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
