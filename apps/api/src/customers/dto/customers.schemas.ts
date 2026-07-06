import { z } from 'zod';
import { CUSTOMER_SORT_FIELDS } from '@tft/shared';

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email(),
  company: z.string().min(1).nullable().optional(),
  phone: z.string().min(1).nullable().optional(),
  notes: z.string().min(1).nullable().optional(),
  trackingOptOut: z.boolean().optional(),
  customFields: z.record(z.string(), z.string().nullable()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
});
export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = z
  .object({
    name: z.string().min(1).optional(),
    company: z.string().min(1).nullable().optional(),
    phone: z.string().min(1).nullable().optional(),
    notes: z.string().min(1).nullable().optional(),
    trackingOptOut: z.boolean().optional(),
    customFields: z.record(z.string(), z.string().nullable()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;

export const customerListQuerySchema = z.object({
  search: z.string().min(1).optional(),
  sort: z.enum(CUSTOMER_SORT_FIELDS).optional().default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
  tagId: z.string().uuid().optional(),
});
export type CustomerListQueryDto = z.infer<typeof customerListQuerySchema>;

export const importCustomersSchema = z.object({
  csv: z.string().min(1, 'CSV content is required'),
});
export type ImportCustomersDto = z.infer<typeof importCustomersSchema>;

export const assignTagSchema = z.object({
  tagId: z.string().uuid(),
});
export type AssignTagDto = z.infer<typeof assignTagSchema>;
