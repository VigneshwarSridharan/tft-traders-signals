import type { TemplateStatus } from "./template-status";

export interface TemplateCategorySummary {
  id: string;
  name: string;
  defaultTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateCategoryRequest {
  name: string;
}

export interface UpdateTemplateCategoryRequest {
  name?: string;
  defaultTemplateId?: string | null;
}

export interface TemplateVersionSummary {
  id: string;
  templateId: string;
  versionNo: number;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  placeholders: string[];
  unknownPlaceholders: string[];
  createdBy: string | null;
  createdAt: string;
}

export interface EmailTemplateSummary {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  status: TemplateStatus;
  currentVersion: TemplateVersionSummary | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateRequest {
  categoryId: string;
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string | null;
}

export interface UpdateTemplateRequest {
  name?: string;
  categoryId?: string;
  status?: TemplateStatus;
}

export interface SaveTemplateVersionRequest {
  subject: string;
  bodyHtml: string;
  bodyText?: string | null;
}

export interface TemplateListQuery {
  categoryId?: string;
  status?: TemplateStatus;
  search?: string;
}

export const MERGE_FIELD_GROUPS = ["customer", "sender", "other"] as const;
export type MergeFieldGroup = (typeof MERGE_FIELD_GROUPS)[number];

export interface MergeFieldOption {
  key: string;
  label: string;
  group: MergeFieldGroup;
}

export interface TemplatePreviewRequest {
  subject?: string;
  bodyHtml?: string;
  bodyText?: string | null;
  customerId?: string;
  sampleData?: Record<string, string>;
}

export interface TemplatePreviewResponse {
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  placeholders: string[];
  unresolvedPlaceholders: string[];
}

export interface TestSendTemplateRequest {
  to: string;
}

export interface TestSendTemplateResponse {
  accepted: boolean;
  to: string;
  stub: true;
}
