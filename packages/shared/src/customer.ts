import type { TagSummary } from "./tag";

export const CUSTOMER_SORT_FIELDS = [
  "name",
  "company",
  "email",
  "engagementScore",
  "createdAt",
] as const;

export type CustomerSortField = (typeof CUSTOMER_SORT_FIELDS)[number];

export interface CustomerSummary {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  notes: string | null;
  trackingOptOut: boolean;
  unsubscribed: boolean;
  suppressed: boolean;
  engagementScore: number;
  tags: TagSummary[];
  customFields: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomerRequest {
  name: string;
  email: string;
  company?: string | null;
  phone?: string | null;
  notes?: string | null;
  trackingOptOut?: boolean;
  customFields?: Record<string, string | null>;
  tagIds?: string[];
}

export interface UpdateCustomerRequest {
  name?: string;
  company?: string | null;
  phone?: string | null;
  notes?: string | null;
  trackingOptOut?: boolean;
  customFields?: Record<string, string | null>;
}

export interface CustomerListQuery {
  search?: string;
  sort?: CustomerSortField;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  tagId?: string;
}

export interface CustomerListResponse {
  items: CustomerSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CsvImportRowError {
  row: number;
  email: string | null;
  reason: string;
}

export interface CsvImportResult {
  imported: number;
  skipped: number;
  errors: CsvImportRowError[];
}
