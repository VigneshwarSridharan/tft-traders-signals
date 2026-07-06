import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { startSendWorker } from './send/send-worker.bootstrap';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const worker = startSendWorker(app);

  const shutdown = () => {
    void (async () => {
      await worker.close();
      await app.close();
      process.exit(0);
    })();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log('Worker process started: consuming the send-email queue.');
}
void bootstrap();
