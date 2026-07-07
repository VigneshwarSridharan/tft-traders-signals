import { z } from 'zod';

export const scheduledSendListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
});
export type ScheduledSendListQueryDto = z.infer<
  typeof scheduledSendListQuerySchema
>;

export const rescheduleSendSchema = z
  .object({
    scheduledFor: z.coerce.date(),
    timezone: z.string().optional(),
  })
  .refine((data) => data.scheduledFor.getTime() > Date.now(), {
    message: 'scheduledFor must be in the future',
    path: ['scheduledFor'],
  });
export type RescheduleSendDto = z.infer<typeof rescheduleSendSchema>;
