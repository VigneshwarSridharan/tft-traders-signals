import { z } from 'zod';

export const createSuppressionSchema = z.object({
  email: z.string().email(),
  customerId: z.string().uuid().optional(),
});
export type CreateSuppressionDto = z.infer<typeof createSuppressionSchema>;
