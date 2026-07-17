import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';

export const STATS_ROLLUP_QUEUE_NAME = 'stats-rollup';
export const ROLLUP_JOB_NAME = 'rollup';

export interface StatsRollupJobData {
  kind: typeof ROLLUP_JOB_NAME;
}

@Injectable()
export class StatsRollupQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue<StatsRollupJobData>;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    this.queue = new Queue<StatsRollupJobData>(STATS_ROLLUP_QUEUE_NAME, {
      connection: parseRedisConnectionOptions(
        configService.get('REDIS_URL', { infer: true }),
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      ROLLUP_JOB_NAME,
      {
        every: this.configService.get('STATS_ROLLUP_POLL_INTERVAL_MS', {
          infer: true,
        }),
      },
      { name: ROLLUP_JOB_NAME, data: { kind: ROLLUP_JOB_NAME } },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
