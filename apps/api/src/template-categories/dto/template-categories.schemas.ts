import { z } from 'zod';

export const createTemplateCategorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
});
export type CreateTemplateCategoryDto = z.infer<
  typeof createTemplateCategorySchema
>;

export const updateTemplateCategorySchema = z
  .object({
    name: z.string().min(1).optional(),
    defaultTemplateId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateTemplateCategoryDto = z.infer<
  typeof updateTemplateCategorySchema
>;
