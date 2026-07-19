import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';

export const REPORT_SUBSCRIPTIONS_QUEUE_NAME = 'report-subscription-jobs';
export const REPORT_SUBSCRIPTIONS_RUN_DUE_JOB_NAME = 'run-due-subscriptions';
export const REPORT_SUBSCRIPTIONS_RUN_NOW_JOB_NAME = 'run-now-subscription';

export type ReportSubscriptionJobData =
  | { kind: typeof REPORT_SUBSCRIPTIONS_RUN_DUE_JOB_NAME }
  | {
      kind: typeof REPORT_SUBSCRIPTIONS_RUN_NOW_JOB_NAME;
      subscriptionId: string;
    };

@Injectable()
export class ReportSubscriptionsQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly queue: Queue<ReportSubscriptionJobData>;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    this.queue = new Queue<ReportSubscriptionJobData>(
      REPORT_SUBSCRIPTIONS_QUEUE_NAME,
      {
        connection: parseRedisConnectionOptions(
          configService.get('REDIS_URL', { infer: true }),
        ),
      },
    );
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      REPORT_SUBSCRIPTIONS_RUN_DUE_JOB_NAME,
      {
        every: this.configService.get('REPORT_SUBSCRIPTION_POLL_INTERVAL_MS', {
          infer: true,
        }),
      },
      {
        name: REPORT_SUBSCRIPTIONS_RUN_DUE_JOB_NAME,
        data: { kind: REPORT_SUBSCRIPTIONS_RUN_DUE_JOB_NAME },
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  async enqueueRunNow(subscriptionId: string): Promise<void> {
    await this.queue.add(REPORT_SUBSCRIPTIONS_RUN_NOW_JOB_NAME, {
      kind: REPORT_SUBSCRIPTIONS_RUN_NOW_JOB_NAME,
      subscriptionId,
    });
  }
}
