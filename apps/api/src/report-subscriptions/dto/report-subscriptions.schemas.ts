import { z } from 'zod';
import {
  REPORT_SUBSCRIPTION_CADENCES,
  REPORT_SUBSCRIPTION_FORMATS,
  REPORT_SUBSCRIPTION_KINDS,
} from '@tft/shared';

const filterParamsSchema = z.object({
  lastDays: z.number().int().positive().max(366).optional(),
  senderAccountId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  status: z.string().optional(),
});

export const createReportSubscriptionSchema = z
  .object({
    name: z.string().min(1).max(200),
    kind: z.enum(REPORT_SUBSCRIPTION_KINDS),
    format: z.enum(REPORT_SUBSCRIPTION_FORMATS),
    filterParams: filterParamsSchema.optional().default({}),
    cadence: z.enum(REPORT_SUBSCRIPTION_CADENCES),
    hourOfDay: z.number().int().min(0).max(23).optional().default(8),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(28).optional(),
    recipientEmails: z.array(z.string().email()).min(1),
    senderAccountId: z.string().uuid(),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'analytics_pdf' && value.format !== 'pdf') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'analytics_pdf subscriptions must use format "pdf"',
        path: ['format'],
      });
    }
    if (value.kind === 'sent_mail' && value.format === 'pdf') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'sent_mail subscriptions must use format "csv" or "xlsx"',
        path: ['format'],
      });
    }
    if (value.cadence === 'weekly' && value.dayOfWeek === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dayOfWeek is required for weekly cadence',
        path: ['dayOfWeek'],
      });
    }
    if (value.cadence === 'monthly' && value.dayOfMonth === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'dayOfMonth is required for monthly cadence',
        path: ['dayOfMonth'],
      });
    }
  });
export type CreateReportSubscriptionDto = z.infer<
  typeof createReportSubscriptionSchema
>;

export const updateReportSubscriptionSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  filterParams: filterParamsSchema.optional(),
  cadence: z.enum(REPORT_SUBSCRIPTION_CADENCES).optional(),
  hourOfDay: z.number().int().min(0).max(23).optional(),
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  recipientEmails: z.array(z.string().email()).min(1).optional(),
  senderAccountId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateReportSubscriptionDto = z.infer<
  typeof updateReportSubscriptionSchema
>;
