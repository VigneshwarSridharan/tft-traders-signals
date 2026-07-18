import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { WebhookEventType } from '@tft/shared';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';

export const WEBHOOK_DELIVERY_QUEUE_NAME = 'webhook-delivery';

export interface WebhookDeliveryJobData {
  deliveryId: string;
  endpointId: string;
  eventType: WebhookEventType;
  data: Record<string, unknown>;
}

@Injectable()
export class WebhookDeliveryQueueService implements OnModuleDestroy {
  private readonly queue: Queue<WebhookDeliveryJobData>;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.queue = new Queue<WebhookDeliveryJobData>(
      WEBHOOK_DELIVERY_QUEUE_NAME,
      {
        connection: parseRedisConnectionOptions(
          configService.get('REDIS_URL', { infer: true }),
        ),
      },
    );
  }

  async enqueue(data: WebhookDeliveryJobData): Promise<void> {
    await this.queue.add('deliver', data, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    // bullmq's underlying socket finishes tearing down a tick after close()
    // resolves; without this, test runners see it as a leaked open handle.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
