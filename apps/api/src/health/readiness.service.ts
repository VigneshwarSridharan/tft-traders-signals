import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import type { ReadinessCheckResponse } from '@tft/shared';
import { PG_POOL } from '../database/database.constants';
import type { EnvConfig } from '../config/env.validation';
import { pingRedis } from './redis-ping.util';

@Injectable()
export class ReadinessService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  async check(): Promise<ReadinessCheckResponse> {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      pingRedis(this.configService.get('REDIS_URL', { infer: true })),
    ]);

    const databaseStatus = database ? 'ok' : 'error';
    const redisStatus = redis ? 'ok' : 'error';

    return {
      status: databaseStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
      checks: { database: databaseStatus, redis: redisStatus },
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
