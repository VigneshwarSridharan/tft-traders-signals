import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';
import {
  COMPLIANCE_QUEUE_NAME,
  EVENT_PURGE_JOB_NAME,
  IP_TRUNCATION_JOB_NAME,
  type ComplianceJobData,
} from './compliance-queue.service';
import { EventPurgeService } from './event-purge.service';
import { IpTruncationService } from './ip-truncation.service';

export function startComplianceWorker(
  app: INestApplicationContext,
): Worker<ComplianceJobData> {
  const configService = app.get(ConfigService<EnvConfig, true>);
  const ipTruncationService = app.get(IpTruncationService);
  const eventPurgeService = app.get(EventPurgeService);
  const connection = parseRedisConnectionOptions(
    configService.get('REDIS_URL', { infer: true }),
  );

  const worker = new Worker<ComplianceJobData>(
    COMPLIANCE_QUEUE_NAME,
    async (job) => {
      if (job.name === IP_TRUNCATION_JOB_NAME) {
        await ipTruncationService.run();
      } else if (job.name === EVENT_PURGE_JOB_NAME) {
        await eventPurgeService.run();
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, error) => {
    console.error(
      `Compliance job ${job?.id} (${job?.name}) failed: ${error.message}`,
    );
  });

  return worker;
}
