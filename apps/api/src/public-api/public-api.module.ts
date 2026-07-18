import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuthModule } from '../auth/auth.module';
import { CustomersModule } from '../customers/customers.module';
import { EmailMessagesModule } from '../email-messages/email-messages.module';
import { SentMailModule } from '../sent-mail/sent-mail.module';
import { TemplatesModule } from '../templates/templates.module';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';
import { ApiKeyRateLimiterService } from './api-key-rate-limiter.service';
import { PublicApiAnalyticsController } from './public-api-analytics.controller';
import { PublicApiCustomersController } from './public-api-customers.controller';
import { PublicApiDocsController } from './public-api-docs.controller';
import { PublicApiMessagesController } from './public-api-messages.controller';
import { PublicApiSendController } from './public-api-send.controller';
import { PublicApiTemplatesController } from './public-api-templates.controller';

@Module({
  imports: [
    AuthModule,
    EmailMessagesModule,
    SentMailModule,
    TemplatesModule,
    CustomersModule,
    AnalyticsModule,
  ],
  controllers: [
    PublicApiSendController,
    PublicApiMessagesController,
    PublicApiTemplatesController,
    PublicApiCustomersController,
    PublicApiAnalyticsController,
    PublicApiDocsController,
  ],
  providers: [ApiKeyRateLimiterService, ApiKeyRateLimitGuard],
})
export class PublicApiModule {}
