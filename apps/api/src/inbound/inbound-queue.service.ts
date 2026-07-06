import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';

export const INBOUND_QUEUE_NAME = 'inbound-sync';
export const SYNC_ALL_JOB_NAME = 'sync-all';
export const DELIVERY_HEURISTIC_JOB_NAME = 'delivery-heuristic';

export interface InboundJobData {
  kind: typeof SYNC_ALL_JOB_NAME | typeof DELIVERY_HEURISTIC_JOB_NAME;
}

@Injectable()
export class InboundQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue<InboundJobData>;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    this.queue = new Queue<InboundJobData>(INBOUND_QUEUE_NAME, {
      connection: parseRedisConnectionOptions(
        configService.get('REDIS_URL', { infer: true }),
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      SYNC_ALL_JOB_NAME,
      {
        every: this.configService.get('INBOUND_POLL_INTERVAL_MS', {
          infer: true,
        }),
      },
      { name: SYNC_ALL_JOB_NAME, data: { kind: SYNC_ALL_JOB_NAME } },
    );
    await this.queue.upsertJobScheduler(
      DELIVERY_HEURISTIC_JOB_NAME,
      {
        every: this.configService.get('DELIVERY_HEURISTIC_POLL_INTERVAL_MS', {
          infer: true,
        }),
      },
      {
        name: DELIVERY_HEURISTIC_JOB_NAME,
        data: { kind: DELIVERY_HEURISTIC_JOB_NAME },
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
