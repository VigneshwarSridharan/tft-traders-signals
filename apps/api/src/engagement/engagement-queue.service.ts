import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';

export const ENGAGEMENT_ROLLUP_QUEUE_NAME = 'engagement-rollup';
export const ENGAGEMENT_ROLLUP_JOB_NAME = 'rollup';

export interface EngagementRollupJobData {
  kind: typeof ENGAGEMENT_ROLLUP_JOB_NAME;
}

@Injectable()
export class EngagementQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue<EngagementRollupJobData>;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    this.queue = new Queue<EngagementRollupJobData>(
      ENGAGEMENT_ROLLUP_QUEUE_NAME,
      {
        connection: parseRedisConnectionOptions(
          configService.get('REDIS_URL', { infer: true }),
        ),
      },
    );
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      ENGAGEMENT_ROLLUP_JOB_NAME,
      {
        every: this.configService.get('ENGAGEMENT_ROLLUP_POLL_INTERVAL_MS', {
          infer: true,
        }),
      },
      {
        name: ENGAGEMENT_ROLLUP_JOB_NAME,
        data: { kind: ENGAGEMENT_ROLLUP_JOB_NAME },
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
