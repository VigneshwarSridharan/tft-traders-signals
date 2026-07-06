import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';
import { DeliveryHeuristicService } from './delivery-heuristic.service';
import {
  DELIVERY_HEURISTIC_JOB_NAME,
  INBOUND_QUEUE_NAME,
  SYNC_ALL_JOB_NAME,
  type InboundJobData,
} from './inbound-queue.service';
import { InboundSyncService } from './inbound-sync.service';

export function startInboundWorker(
  app: INestApplicationContext,
): Worker<InboundJobData> {
  const configService = app.get(ConfigService<EnvConfig, true>);
  const inboundSyncService = app.get(InboundSyncService);
  const deliveryHeuristicService = app.get(DeliveryHeuristicService);
  const connection = parseRedisConnectionOptions(
    configService.get('REDIS_URL', { infer: true }),
  );

  const worker = new Worker<InboundJobData>(
    INBOUND_QUEUE_NAME,
    async (job) => {
      if (job.name === SYNC_ALL_JOB_NAME) {
        await inboundSyncService.syncAllAccounts();
      } else if (job.name === DELIVERY_HEURISTIC_JOB_NAME) {
        await deliveryHeuristicService.run();
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, error) => {
    console.error(
      `Inbound job ${job?.id} (${job?.name}) failed: ${error.message}`,
    );
  });

  return worker;
}
