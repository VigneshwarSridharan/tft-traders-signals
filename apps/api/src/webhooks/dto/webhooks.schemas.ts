import { z } from 'zod';
import { WEBHOOK_EVENT_TYPES } from '@tft/shared';

export const createWebhookEndpointSchema = z.object({
  url: z.string().url(),
  events: z
    .array(z.enum(WEBHOOK_EVENT_TYPES))
    .min(1, 'At least one event is required'),
});
export type CreateWebhookEndpointDto = z.infer<
  typeof createWebhookEndpointSchema
>;

export const updateWebhookEndpointSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWebhookEndpointDto = z.infer<
  typeof updateWebhookEndpointSchema
>;

export const listWebhookDeliveriesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
export type ListWebhookDeliveriesQueryDto = z.infer<
  typeof listWebhookDeliveriesQuerySchema
>;
