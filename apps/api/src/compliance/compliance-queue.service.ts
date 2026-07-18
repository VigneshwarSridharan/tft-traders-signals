import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { parseRedisConnectionOptions } from '../send/redis-connection.util';

export const COMPLIANCE_QUEUE_NAME = 'compliance-jobs';
export const IP_TRUNCATION_JOB_NAME = 'ip-truncation';
export const EVENT_PURGE_JOB_NAME = 'event-purge';

export interface ComplianceJobData {
  kind: typeof IP_TRUNCATION_JOB_NAME | typeof EVENT_PURGE_JOB_NAME;
}

@Injectable()
export class ComplianceQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue<ComplianceJobData>;

  constructor(private readonly configService: ConfigService<EnvConfig, true>) {
    this.queue = new Queue<ComplianceJobData>(COMPLIANCE_QUEUE_NAME, {
      connection: parseRedisConnectionOptions(
        configService.get('REDIS_URL', { infer: true }),
      ),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      IP_TRUNCATION_JOB_NAME,
      {
        every: this.configService.get('IP_TRUNCATION_POLL_INTERVAL_MS', {
          infer: true,
        }),
      },
      {
        name: IP_TRUNCATION_JOB_NAME,
        data: { kind: IP_TRUNCATION_JOB_NAME },
      },
    );
    await this.queue.upsertJobScheduler(
      EVENT_PURGE_JOB_NAME,
      {
        every: this.configService.get('EVENT_PURGE_POLL_INTERVAL_MS', {
          infer: true,
        }),
      },
      { name: EVENT_PURGE_JOB_NAME, data: { kind: EVENT_PURGE_JOB_NAME } },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
