import cookieParser from 'cookie-parser';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import type { EnvConfig } from './config/env.validation';
import { RealtimeEventsService } from './realtime/realtime-events.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService<EnvConfig, true>);
  await app.get(RealtimeEventsService).start();

  // Behind the Caddy reverse proxy in every deployment — needed so req.ip
  // (used for tracking-endpoint rate limiting) reflects the real client IP.
  app.set('trust proxy', true);

  app.use(cookieParser());
  app.enableCors({
    origin: configService.get('WEB_APP_URL', { infer: true }),
    credentials: true,
  });

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
}
void bootstrap();
