// Must be the first import in the process — see main.ts for why.
import './instrument';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { startSendWorker } from './send/send-worker.bootstrap';
import { startTrackingWorker } from './tracking/tracking-worker.bootstrap';
import { startInboundWorker } from './inbound/inbound-worker.bootstrap';
import { startStatsRollupWorker } from './analytics/stats-rollup-worker.bootstrap';
import { startEngagementWorker } from './engagement/engagement-worker.bootstrap';
import { startComplianceWorker } from './compliance/compliance-worker.bootstrap';
import { startWebhookWorker } from './webhooks/webhook-delivery-worker.bootstrap';
import { startWorkerHealthServer } from './health/worker-health-server';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));
  const logger = new Logger('Worker');
  const healthServer = startWorkerHealthServer(app);
  const sendWorker = startSendWorker(app);
  const trackingWorker = startTrackingWorker(app);
  const inboundWorker = startInboundWorker(app);
  const statsRollupWorker = startStatsRollupWorker(app);
  const engagementWorker = startEngagementWorker(app);
  const complianceWorker = startComplianceWorker(app);
  const webhookWorker = startWebhookWorker(app);

  const shutdown = () => {
    void (async () => {
      await sendWorker.close();
      await trackingWorker.close();
      await inboundWorker.close();
      await statsRollupWorker.close();
      await engagementWorker.close();
      await complianceWorker.close();
      await webhookWorker.close();
      await new Promise((resolve) => healthServer.close(resolve));
      await app.close();
      process.exit(0);
    })();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.log(
    'Worker process started: consuming the send-email, tracking-events, inbound-sync, stats-rollup, engagement-rollup, compliance, and webhook-delivery queues.',
  );
}
void bootstrap();
