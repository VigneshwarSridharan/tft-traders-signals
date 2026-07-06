import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { EnvConfig } from '../config/env.validation';
import { PG_POOL } from './database.constants';
import { UsersRepository } from './users.repository';
import { SessionsRepository } from './sessions.repository';
import { InvitationsRepository } from './invitations.repository';

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
  ],
  exports: [
    PG_POOL,
    UsersRepository,
    SessionsRepository,
    InvitationsRepository,
  ],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
