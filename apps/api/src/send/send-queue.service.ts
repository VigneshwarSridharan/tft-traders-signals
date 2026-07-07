import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from './redis-connection.util';

export const SEND_QUEUE_NAME = 'send-email';

export interface SendJobData {
  messageId: string;
}

@Injectable()
export class SendQueueService implements OnModuleDestroy {
  private readonly queue: Queue<SendJobData>;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.queue = new Queue<SendJobData>(SEND_QUEUE_NAME, {
      connection: parseRedisConnectionOptions(
        configService.get('REDIS_URL', { infer: true }),
      ),
    });
  }

  async enqueueSend(messageId: string): Promise<void> {
    await this.queue.add(
      'send',
      { messageId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
  }

  /** Delayed jobs live in Redis, so a scheduled send survives a worker restart. */
  async enqueueScheduledSend(
    messageId: string,
    scheduledFor: Date,
  ): Promise<string> {
    const delay = Math.max(0, scheduledFor.getTime() - Date.now());
    const job = await this.queue.add(
      'send',
      { messageId },
      {
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    );
    return String(job.id);
  }

  /** Removes a still-pending (waiting/delayed) job; a no-op if it already started processing. */
  async cancelQueuedJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (!job) {
      return;
    }
    const state = await job.getState();
    if (state === 'delayed' || state === 'waiting') {
      await job.remove();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    // bullmq's underlying socket finishes tearing down a tick after close()
    // resolves; without this, test runners see it as a leaked open handle.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
