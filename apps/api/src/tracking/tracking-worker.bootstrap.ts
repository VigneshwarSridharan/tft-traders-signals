import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';
import { TrackingEventProcessorService } from './tracking-event-processor.service';
import {
  TRACKING_QUEUE_NAME,
  type TrackingJobData,
} from './tracking-queue.service';

export function startTrackingWorker(
  app: INestApplicationContext,
): Worker<TrackingJobData> {
  const configService = app.get(ConfigService<EnvConfig, true>);
  const processor = app.get(TrackingEventProcessorService);
  const connection = parseRedisConnectionOptions(
    configService.get('REDIS_URL', { infer: true }),
  );

  const worker = new Worker<TrackingJobData>(
    TRACKING_QUEUE_NAME,
    (job) => processor.processJob(job),
    { connection, concurrency: 10 },
  );

  worker.on('failed', (job, error) => {
    console.error(`Tracking event job ${job?.id} failed: ${error.message}`);
  });

  return worker;
}
