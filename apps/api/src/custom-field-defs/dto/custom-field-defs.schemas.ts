import { z } from 'zod';
import { CUSTOM_FIELD_TYPES } from '@tft/shared';

export const createCustomFieldDefSchema = z.object({
  key: z
    .string()
    .min(1, 'Key is required')
    .regex(
      /^[a-z][a-z0-9_]*$/,
      'Key must be lowercase letters, numbers, and underscores, starting with a letter',
    ),
  label: z.string().min(1, 'Label is required'),
  fieldType: z.enum(CUSTOM_FIELD_TYPES),
});
export type CreateCustomFieldDefDto = z.infer<
  typeof createCustomFieldDefSchema
>;

export const updateCustomFieldDefSchema = z
  .object({
    label: z.string().min(1).optional(),
    fieldType: z.enum(CUSTOM_FIELD_TYPES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateCustomFieldDefDto = z.infer<
  typeof updateCustomFieldDefSchema
>;
