import type { CustomFieldType } from "./custom-field-type";

export interface CustomFieldDefSummary {
  id: string;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  createdAt: string;
}

export interface CreateCustomFieldDefRequest {
  key: string;
  label: string;
  fieldType: CustomFieldType;
}

export interface UpdateCustomFieldDefRequest {
  label?: string;
  fieldType?: CustomFieldType;
}
