import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';

export const TRACKING_QUEUE_NAME = 'tracking-events';

export interface TrackingOpenJobData {
  kind: 'open';
  token: string;
  ip: string | null;
  userAgent: string | null;
  occurredAt: string;
}

export interface TrackingClickJobData {
  kind: 'click';
  token: string;
  linkId: string;
  messageId: string;
  ip: string | null;
  userAgent: string | null;
  occurredAt: string;
}

export type TrackingJobData = TrackingOpenJobData | TrackingClickJobData;

@Injectable()
export class TrackingQueueService implements OnModuleDestroy {
  private readonly queue: Queue<TrackingJobData>;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.queue = new Queue<TrackingJobData>(TRACKING_QUEUE_NAME, {
      connection: parseRedisConnectionOptions(
        configService.get('REDIS_URL', { infer: true }),
      ),
    });
  }

  async enqueueOpen(data: Omit<TrackingOpenJobData, 'kind'>): Promise<void> {
    await this.queue.add(
      'open',
      { kind: 'open', ...data },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  }

  async enqueueClick(data: Omit<TrackingClickJobData, 'kind'>): Promise<void> {
    await this.queue.add(
      'click',
      { kind: 'click', ...data },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
