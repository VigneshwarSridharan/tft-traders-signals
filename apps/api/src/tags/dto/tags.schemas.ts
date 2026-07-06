import { z } from 'zod';

export const createTagSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  color: z.string().min(1).nullable().optional(),
});
export type CreateTagDto = z.infer<typeof createTagSchema>;

export const updateTagSchema = z
  .object({
    name: z.string().min(1).optional(),
    color: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateTagDto = z.infer<typeof updateTagSchema>;
