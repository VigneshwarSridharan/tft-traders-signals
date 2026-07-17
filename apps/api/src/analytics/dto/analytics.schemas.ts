import { z } from 'zod';
import { ANALYTICS_TIMESERIES_GRAINS } from '@tft/shared';

export const analyticsKpisQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  senderAccountId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
});
export type AnalyticsKpisQueryDto = z.infer<typeof analyticsKpisQuerySchema>;

export const analyticsTimeseriesQuerySchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  grain: z.enum(ANALYTICS_TIMESERIES_GRAINS).optional().default('day'),
  senderAccountId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
});
export type AnalyticsTimeseriesQueryDto = z.infer<
  typeof analyticsTimeseriesQuerySchema
>;
