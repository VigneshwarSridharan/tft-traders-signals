import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { SentryModule, SentryGlobalFilter } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv, type EnvConfig } from './config/env.validation';
import { buildPinoOptions } from './logging/pino-options';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SenderAccountsModule } from './sender-accounts/sender-accounts.module';
import { CustomersModule } from './customers/customers.module';
import { CustomFieldDefsModule } from './custom-field-defs/custom-field-defs.module';
import { TagsModule } from './tags/tags.module';
import { TemplateCategoriesModule } from './template-categories/template-categories.module';
import { TemplatesModule } from './templates/templates.module';
import { EmailMessagesModule } from './email-messages/email-messages.module';
import { TrackingModule } from './tracking/tracking.module';
import { InboundModule } from './inbound/inbound.module';
import { SuppressionsModule } from './suppressions/suppressions.module';
import { SentMailModule } from './sent-mail/sent-mail.module';
import { ScheduledSendsModule } from './scheduled-sends/scheduled-sends.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EngagementModule } from './engagement/engagement.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { SettingsModule } from './settings/settings.module';
import { UnsubscribeModule } from './unsubscribe/unsubscribe.module';
import { ComplianceModule } from './compliance/compliance.module';
import { ReportsModule } from './reports/reports.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PublicApiModule } from './public-api/public-api.module';
import { ReportSubscriptionsModule } from './report-subscriptions/report-subscriptions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    // Must import before any other module — see src/instrument.ts.
    SentryModule.forRoot(),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) =>
        buildPinoOptions(configService),
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    SenderAccountsModule,
    CustomersModule,
    CustomFieldDefsModule,
    TagsModule,
    TemplateCategoriesModule,
    TemplatesModule,
    EmailMessagesModule,
    TrackingModule,
    InboundModule,
    SuppressionsModule,
    SentMailModule,
    ScheduledSendsModule,
    AnalyticsModule,
    RealtimeModule,
    NotificationsModule,
    EngagementModule,
    AuditLogsModule,
    SettingsModule,
    UnsubscribeModule,
    ComplianceModule,
    ReportsModule,
    ApiKeysModule,
    WebhooksModule,
    PublicApiModule,
    ReportSubscriptionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
