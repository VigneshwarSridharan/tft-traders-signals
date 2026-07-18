import type {
  WebhookDeliverySummary,
  WebhookEndpointSummary,
  WebhookEventType,
} from '@tft/shared';
import type { WebhookDeliveryRow, WebhookEndpointRow } from '../database/rows';

/** Never include `secret_enc` on any outbound DTO. */
export function toWebhookEndpointSummary(
  row: WebhookEndpointRow,
): WebhookEndpointSummary {
  return {
    id: row.id,
    url: row.url,
    events: row.events as WebhookEventType[],
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toWebhookDeliverySummary(
  row: WebhookDeliveryRow,
): WebhookDeliverySummary {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    eventType: row.event_type,
    attempt: row.attempt,
    responseStatus: row.response_status,
    delivered: row.delivered_at !== null,
    createdAt: row.created_at.toISOString(),
  };
}
