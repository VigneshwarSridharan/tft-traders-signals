import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';
import {
  WEBHOOK_DELIVERY_QUEUE_NAME,
  type WebhookDeliveryJobData,
} from './webhook-delivery-queue.service';
import { WebhookDeliveryWorkerService } from './webhook-delivery-worker.service';

export function startWebhookWorker(
  app: INestApplicationContext,
): Worker<WebhookDeliveryJobData> {
  const configService = app.get(ConfigService<EnvConfig, true>);
  const webhookDeliveryWorkerService = app.get(WebhookDeliveryWorkerService);
  const connection = parseRedisConnectionOptions(
    configService.get('REDIS_URL', { infer: true }),
  );

  const worker = new Worker<WebhookDeliveryJobData>(
    WEBHOOK_DELIVERY_QUEUE_NAME,
    (job) => webhookDeliveryWorkerService.processDeliveryJob(job),
    { connection, concurrency: 5 },
  );

  worker.on('failed', (job, error) => {
    console.error(`Webhook delivery job ${job?.id} failed: ${error.message}`);
  });

  return worker;
}
