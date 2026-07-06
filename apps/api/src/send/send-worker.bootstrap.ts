import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import type { EnvConfig } from '../config/env.validation';
import { EmailSenderService } from './email-sender.service';
import { parseRedisConnectionOptions } from './redis-connection.util';
import { SEND_QUEUE_NAME, type SendJobData } from './send-queue.service';

export function startSendWorker(
  app: INestApplicationContext,
): Worker<SendJobData> {
  const configService = app.get(ConfigService<EnvConfig, true>);
  const emailSender = app.get(EmailSenderService);
  const connection = parseRedisConnectionOptions(
    configService.get('REDIS_URL', { infer: true }),
  );

  const worker = new Worker<SendJobData>(
    SEND_QUEUE_NAME,
    (job, token) => emailSender.processSendJob(job, token),
    { connection, concurrency: 5 },
  );

  worker.on('failed', (job, error) => {
    console.error(`Send job ${job?.id} failed: ${error.message}`);
  });

  return worker;
}
