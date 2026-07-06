import { z } from 'zod';
import { USER_ROLES } from '@tft/shared';

export const inviteUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(USER_ROLES),
});
export type InviteUserDto = z.infer<typeof inviteUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    role: z.enum(USER_ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
