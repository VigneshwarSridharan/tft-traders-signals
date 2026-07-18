import { Injectable, Logger } from '@nestjs/common';
import type { WebhookEventType } from '@tft/shared';
import { WebhookDeliveriesRepository } from '../database/webhook-deliveries.repository';
import { WebhookEndpointsRepository } from '../database/webhook-endpoints.repository';
import { WebhookDeliveryQueueService } from './webhook-delivery-queue.service';

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Fans an internal event (send/tracking/inbound/unsubscribe pipelines) out
 * to every active webhook endpoint subscribed to it. Mirrors
 * NotificationsService's "never throws" contract — a webhook subscriber
 * misconfiguration or a DB hiccup here must never break the pipeline that
 * triggered the event.
 */
@Injectable()
export class WebhookDispatchService {
  private readonly logger = new Logger(WebhookDispatchService.name);

  constructor(
    private readonly webhookEndpointsRepository: WebhookEndpointsRepository,
    private readonly webhookDeliveriesRepository: WebhookDeliveriesRepository,
    private readonly webhookDeliveryQueueService: WebhookDeliveryQueueService,
  ) {}

  async dispatch(
    eventType: WebhookEventType,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      const endpoints =
        await this.webhookEndpointsRepository.findActiveByEvent(eventType);
      for (const endpoint of endpoints) {
        const delivery = await this.webhookDeliveriesRepository.create({
          endpointId: endpoint.id,
          eventType,
          payload: data,
        });
        await this.webhookDeliveryQueueService.enqueue({
          deliveryId: delivery.id,
          endpointId: endpoint.id,
          eventType,
          data,
        });
      }
    } catch (error) {
      this.logger.error(
        `Failed to dispatch ${eventType} webhook event: ${toErrorMessage(error)}`,
      );
    }
  }
}
