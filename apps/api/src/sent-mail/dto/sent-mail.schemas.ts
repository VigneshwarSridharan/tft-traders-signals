import { z } from 'zod';
import { MESSAGE_STATUSES, SENT_MAIL_SORT_FIELDS } from '@tft/shared';

export const sentMailListQuerySchema = z.object({
  search: z.string().min(1).optional(),
  status: z.enum(MESSAGE_STATUSES).optional(),
  senderAccountId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sort: z.enum(SENT_MAIL_SORT_FIELDS).optional().default('sentAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
});
export type SentMailListQueryDto = z.infer<typeof sentMailListQuerySchema>;

export const messageDetailQuerySchema = z.object({
  includeBotEvents: z.preprocess((value) => value === 'true', z.boolean()),
});
export type MessageDetailQueryDto = z.infer<typeof messageDetailQuerySchema>;

export const assignMessageTagSchema = z.object({
  tagId: z.string().uuid(),
});
export type AssignMessageTagDto = z.infer<typeof assignMessageTagSchema>;
