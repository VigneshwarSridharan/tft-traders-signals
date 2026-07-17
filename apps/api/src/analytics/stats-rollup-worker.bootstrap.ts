import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';
import {
  ROLLUP_JOB_NAME,
  STATS_ROLLUP_QUEUE_NAME,
  type StatsRollupJobData,
} from './stats-rollup-queue.service';
import { StatsRollupService } from './stats-rollup.service';

export function startStatsRollupWorker(
  app: INestApplicationContext,
): Worker<StatsRollupJobData> {
  const configService = app.get(ConfigService<EnvConfig, true>);
  const statsRollupService = app.get(StatsRollupService);
  const connection = parseRedisConnectionOptions(
    configService.get('REDIS_URL', { infer: true }),
  );

  const worker = new Worker<StatsRollupJobData>(
    STATS_ROLLUP_QUEUE_NAME,
    async (job) => {
      if (job.name === ROLLUP_JOB_NAME) {
        await statsRollupService.run();
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, error) => {
    console.error(
      `Stats rollup job ${job?.id} (${job?.name}) failed: ${error.message}`,
    );
  });

  return worker;
}
