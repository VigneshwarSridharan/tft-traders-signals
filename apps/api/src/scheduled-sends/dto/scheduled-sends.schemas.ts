import { z } from 'zod';

export const rescheduleSendSchema = z.object({
  scheduledFor: z.string().datetime(),
  timezone: z.string().optional(),
});
export type RescheduleSendDto = z.infer<typeof rescheduleSendSchema>;
