import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

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
    scheduledFor: z.coerce.date().optional(),
    timezone: z.string().optional(),
    parentMessageId: z.string().uuid().optional(),
    followUpDays: z.coerce.number().int().positive().max(90).optional(),
  })
  .refine(
    (data) =>
      Boolean(data.templateVersionId) || Boolean(data.subject && data.bodyHtml),
    {
      message:
        'Either templateVersionId or both subject and bodyHtml must be provided',
    },
  )
  .refine(
    (data) => !data.scheduledFor || data.scheduledFor.getTime() > Date.now(),
    { message: 'scheduledFor must be in the future', path: ['scheduledFor'] },
  )
  .refine((data) => !data.parentMessageId || data.customerIds.length === 1, {
    message:
      'parentMessageId (a threaded follow-up) requires exactly one recipient',
    path: ['parentMessageId'],
  });

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
