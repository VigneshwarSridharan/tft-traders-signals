import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { EnvConfig } from '../config/env.validation';
import { PG_POOL } from './database.constants';
import { UsersRepository } from './users.repository';
import { SessionsRepository } from './sessions.repository';
import { InvitationsRepository } from './invitations.repository';
import { SenderAccountsRepository } from './sender-accounts.repository';
import { CustomersRepository } from './customers.repository';
import { CustomFieldDefsRepository } from './custom-field-defs.repository';
import { TagsRepository } from './tags.repository';
import { TemplateCategoriesRepository } from './template-categories.repository';
import { TemplatesRepository } from './templates.repository';
import { EmailMessagesRepository } from './email-messages.repository';
import { EmailLinksRepository } from './email-links.repository';
import { TrackingEventsRepository } from './tracking-events.repository';
import { InboundRepository } from './inbound.repository';
import { SuppressionsRepository } from './suppressions.repository';
import { AuditLogsRepository } from './audit-logs.repository';
import { ScheduledSendsRepository } from './scheduled-sends.repository';
import { DailyStatsRepository } from './daily-stats.repository';
import { AnalyticsLeaderboardsRepository } from './analytics-leaderboards.repository';
import { NotificationsRepository } from './notifications.repository';

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) =>
        new Pool({
          connectionString: configService.get('DATABASE_URL', {
            infer: true,
          }),
        }),
    },
    UsersRepository,
    SessionsRepository,
    InvitationsRepository,
    SenderAccountsRepository,
    CustomersRepository,
    CustomFieldDefsRepository,
    TagsRepository,
    TemplateCategoriesRepository,
    TemplatesRepository,
    EmailMessagesRepository,
    EmailLinksRepository,
    TrackingEventsRepository,
    InboundRepository,
    SuppressionsRepository,
    AuditLogsRepository,
    ScheduledSendsRepository,
    DailyStatsRepository,
    AnalyticsLeaderboardsRepository,
    NotificationsRepository,
  ],
  exports: [
    PG_POOL,
    UsersRepository,
    SessionsRepository,
    InvitationsRepository,
    SenderAccountsRepository,
    CustomersRepository,
    CustomFieldDefsRepository,
    TagsRepository,
    TemplateCategoriesRepository,
    TemplatesRepository,
    EmailMessagesRepository,
    EmailLinksRepository,
    TrackingEventsRepository,
    InboundRepository,
    SuppressionsRepository,
    AuditLogsRepository,
    ScheduledSendsRepository,
    DailyStatsRepository,
    AnalyticsLeaderboardsRepository,
    NotificationsRepository,
  ],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
