import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { startSendWorker } from './send/send-worker.bootstrap';
import { startTrackingWorker } from './tracking/tracking-worker.bootstrap';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const sendWorker = startSendWorker(app);
  const trackingWorker = startTrackingWorker(app);

  const shutdown = () => {
    void (async () => {
      await sendWorker.close();
      await trackingWorker.close();
      await app.close();
      process.exit(0);
    })();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log(
    'Worker process started: consuming the send-email and tracking-events queues.',
  );
}
void bootstrap();
