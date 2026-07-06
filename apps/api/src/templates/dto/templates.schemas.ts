import { z } from 'zod';
import { TEMPLATE_STATUSES } from '@tft/shared';

export const createTemplateSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1, 'Name is required'),
  subject: z.string().min(1, 'Subject is required'),
  bodyHtml: z.string().min(1, 'Body is required'),
  bodyText: z.string().nullable().optional(),
});
export type CreateTemplateDto = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z
  .object({
    name: z.string().min(1).optional(),
    categoryId: z.string().uuid().optional(),
    status: z.enum(TEMPLATE_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateTemplateDto = z.infer<typeof updateTemplateSchema>;

export const saveTemplateVersionSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  bodyHtml: z.string().min(1, 'Body is required'),
  bodyText: z.string().nullable().optional(),
});
export type SaveTemplateVersionDto = z.infer<typeof saveTemplateVersionSchema>;

export const templateListQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  status: z.enum(TEMPLATE_STATUSES).optional(),
  search: z.string().optional(),
});
export type TemplateListQueryDto = z.infer<typeof templateListQuerySchema>;

export const templatePreviewSchema = z.object({
  subject: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().nullable().optional(),
  customerId: z.string().uuid().optional(),
  sampleData: z.record(z.string(), z.string()).optional(),
});
export type TemplatePreviewDto = z.infer<typeof templatePreviewSchema>;

export const testSendTemplateSchema = z.object({
  to: z.string().email(),
});
export type TestSendTemplateDto = z.infer<typeof testSendTemplateSchema>;
