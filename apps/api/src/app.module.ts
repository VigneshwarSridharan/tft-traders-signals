import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
