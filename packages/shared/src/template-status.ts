export const TEMPLATE_STATUSES = ["draft", "active", "archived"] as const;

export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];
