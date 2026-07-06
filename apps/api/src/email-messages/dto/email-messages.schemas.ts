import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { MESSAGE_LIST_SORT_FIELDS, MESSAGE_STATUSES } from '@tft/shared';

export const composeSendSchema = z
  .object({
    senderAccountId: z.string().uuid(),
    customerIds: z.array(z.string().uuid()).min(1),
    templateVersionId: z.string().uuid().optional(),
    subject: z.string().min(1).optional(),
    bodyHtml: z.string().min(1).optional(),
    bodyText: z.string().nullable().optional(),
    fallbackValues: z.record(z.string(), z.string()).optional(),
    trackingEnabled: z.boolean().optional(),
    overrideSuppression: z.boolean().optional(),
  })
  .refine(
    (data) =>
      Boolean(data.templateVersionId) || Boolean(data.subject && data.bodyHtml),
    {
      message:
        'Either templateVersionId or both subject and bodyHtml must be provided',
    },
  );

export type ComposeSendDto = z.infer<typeof composeSendSchema>;

export const composeTestSendSchema = z
  .object({
    senderAccountId: z.string().uuid(),
    templateVersionId: z.string().uuid().optional(),
    subject: z.string().min(1).optional(),
    bodyHtml: z.string().min(1).optional(),
    bodyText: z.string().nullable().optional(),
    customerId: z.string().uuid().optional(),
    fallbackValues: z.record(z.string(), z.string()).optional(),
  })
  .refine(
    (data) =>
      Boolean(data.templateVersionId) || Boolean(data.subject && data.bodyHtml),
    {
      message:
        'Either templateVersionId or both subject and bodyHtml must be provided',
    },
  );

export type ComposeTestSendDto = z.infer<typeof composeTestSendSchema>;

export const messageListQuerySchema = z.object({
  search: z.string().min(1).optional(),
  status: z.enum(MESSAGE_STATUSES).optional(),
  senderAccountId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sort: z.enum(MESSAGE_LIST_SORT_FIELDS).optional().default('sentAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
});
export type MessageListQueryDto = z.infer<typeof messageListQuerySchema>;

const booleanQueryParam = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

export const timelineQuerySchema = z.object({
  includeBotEvents: booleanQueryParam.optional().default(false),
});
export type TimelineQueryDto = z.infer<typeof timelineQuerySchema>;

export const assignMessageTagSchema = z.object({
  tagId: z.string().uuid(),
});
export type AssignMessageTagDto = z.infer<typeof assignMessageTagSchema>;

export const createSavedMessageFilterSchema = z.object({
  name: z.string().min(1),
  filter: messageListQuerySchema,
});
export type CreateSavedMessageFilterDto = z.infer<
  typeof createSavedMessageFilterSchema
>;

export function parseComposePayload(raw: string): ComposeSendDto {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BadRequestException('payload must be valid JSON');
  }
  const result = composeSendSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new BadRequestException(issues);
  }
  return result.data;
}
