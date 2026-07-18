import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';
import {
  ENGAGEMENT_ROLLUP_JOB_NAME,
  ENGAGEMENT_ROLLUP_QUEUE_NAME,
  type EngagementRollupJobData,
} from './engagement-queue.service';
import { EngagementRollupService } from './engagement-rollup.service';

export function startEngagementWorker(
  app: INestApplicationContext,
): Worker<EngagementRollupJobData> {
  const configService = app.get(ConfigService<EnvConfig, true>);
  const engagementRollupService = app.get(EngagementRollupService);
  const connection = parseRedisConnectionOptions(
    configService.get('REDIS_URL', { infer: true }),
  );

  const worker = new Worker<EngagementRollupJobData>(
    ENGAGEMENT_ROLLUP_QUEUE_NAME,
    async (job) => {
      if (job.name === ENGAGEMENT_ROLLUP_JOB_NAME) {
        await engagementRollupService.run();
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, error) => {
    console.error(
      `Engagement rollup job ${job?.id} (${job?.name}) failed: ${error.message}`,
    );
  });

  return worker;
}
