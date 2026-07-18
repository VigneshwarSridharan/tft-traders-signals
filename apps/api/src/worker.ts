import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { startSendWorker } from './send/send-worker.bootstrap';
import { startTrackingWorker } from './tracking/tracking-worker.bootstrap';
import { startInboundWorker } from './inbound/inbound-worker.bootstrap';
import { startStatsRollupWorker } from './analytics/stats-rollup-worker.bootstrap';
import { startEngagementWorker } from './engagement/engagement-worker.bootstrap';
import { startComplianceWorker } from './compliance/compliance-worker.bootstrap';
import { startWebhookWorker } from './webhooks/webhook-delivery-worker.bootstrap';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
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
      await app.close();
      process.exit(0);
    })();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log(
    'Worker process started: consuming the send-email, tracking-events, inbound-sync, stats-rollup, engagement-rollup, compliance, and webhook-delivery queues.',
  );
}
void bootstrap();
