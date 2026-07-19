import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';
import {
  REPORT_SUBSCRIPTIONS_QUEUE_NAME,
  REPORT_SUBSCRIPTIONS_RUN_DUE_JOB_NAME,
  REPORT_SUBSCRIPTIONS_RUN_NOW_JOB_NAME,
  type ReportSubscriptionJobData,
} from './report-subscriptions-queue.service';
import { ReportSubscriptionRunnerService } from './report-subscription-runner.service';

export function startReportSubscriptionsWorker(
  app: INestApplicationContext,
): Worker<ReportSubscriptionJobData> {
  const configService = app.get(ConfigService<EnvConfig, true>);
  const runnerService = app.get(ReportSubscriptionRunnerService);
  const connection = parseRedisConnectionOptions(
    configService.get('REDIS_URL', { infer: true }),
  );

  const worker = new Worker<ReportSubscriptionJobData>(
    REPORT_SUBSCRIPTIONS_QUEUE_NAME,
    async (job) => {
      if (job.data.kind === REPORT_SUBSCRIPTIONS_RUN_DUE_JOB_NAME) {
        await runnerService.runDue();
      } else if (job.data.kind === REPORT_SUBSCRIPTIONS_RUN_NOW_JOB_NAME) {
        await runnerService.runNow(job.data.subscriptionId);
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, error) => {
    console.error(
      `Report subscription job ${job?.id} (${job?.name}) failed: ${error.message}`,
    );
  });

  return worker;
}
