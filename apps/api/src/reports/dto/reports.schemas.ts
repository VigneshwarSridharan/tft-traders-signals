import { z } from 'zod';
import { MESSAGE_STATUSES, SENT_MAIL_SORT_FIELDS } from '@tft/shared';

export const EXPORT_FORMATS = ['csv', 'xlsx'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const ANALYTICS_EXPORT_VIEWS = [
  'kpis',
  'timeseries',
  'templates',
  'accounts',
  'emails',
  'links',
  'customers',
] as const;
export type AnalyticsExportView = (typeof ANALYTICS_EXPORT_VIEWS)[number];

export const sentMailExportQuerySchema = z.object({
  format: z.enum(EXPORT_FORMATS).optional().default('csv'),
  search: z.string().min(1).optional(),
  status: z.enum(MESSAGE_STATUSES).optional(),
  senderAccountId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sort: z.enum(SENT_MAIL_SORT_FIELDS).optional().default('sentAt'),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
});
export type SentMailExportQueryDto = z.infer<typeof sentMailExportQuerySchema>;

export const analyticsExportQuerySchema = z.object({
  view: z.enum(ANALYTICS_EXPORT_VIEWS),
  format: z.enum(EXPORT_FORMATS).optional().default('csv'),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  senderAccountId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
});
export type AnalyticsExportQueryDto = z.infer<
  typeof analyticsExportQuerySchema
>;

export const analyticsPdfQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  senderAccountId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
});
export type AnalyticsPdfQueryDto = z.infer<typeof analyticsPdfQuerySchema>;
