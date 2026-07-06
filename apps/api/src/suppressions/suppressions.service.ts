import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SuppressionSummary } from '@tft/shared';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { SuppressionsRepository } from '../database/suppressions.repository';
import type { CreateSuppressionDto } from './dto/suppressions.schemas';
import { toSuppressionSummary } from './suppressions.mapper';

@Injectable()
export class SuppressionsService {
  constructor(
    private readonly suppressionsRepository: SuppressionsRepository,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  async list(): Promise<SuppressionSummary[]> {
    const rows = await this.suppressionsRepository.list();
    return rows.map(toSuppressionSummary);
  }

  async create(
    input: CreateSuppressionDto,
    userId: string,
  ): Promise<SuppressionSummary> {
    const existing = await this.suppressionsRepository.findByEmail(input.email);
    if (existing && !existing.released_at) {
      throw new ConflictException('This address is already suppressed');
    }

    const row = await this.suppressionsRepository.upsert({
      email: input.email,
      customerId: input.customerId ?? null,
      reason: 'manual',
      sourceMessageId: null,
    });

    await this.auditLogsRepository.record({
      userId,
      action: 'suppression.create',
      entityType: 'suppression',
      entityId: row.id,
      metadata: { email: row.email, reason: row.reason },
    });

    return toSuppressionSummary(row);
  }

  async release(id: string, userId: string): Promise<SuppressionSummary> {
    const row = await this.suppressionsRepository.release(id, userId);
    if (!row) {
      const existing = await this.suppressionsRepository.findById(id);
      if (!existing) {
        throw new NotFoundException('Suppression not found');
      }
      throw new ConflictException('Suppression has already been released');
    }

    await this.auditLogsRepository.record({
      userId,
      action: 'suppression.release',
      entityType: 'suppression',
      entityId: row.id,
      metadata: { email: row.email, reason: row.reason },
    });

    return toSuppressionSummary(row);
  }
}
