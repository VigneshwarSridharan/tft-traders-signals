import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ReportSubscriptionSummary } from '@tft/shared';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { ReportSubscriptionsRepository } from '../database/report-subscriptions.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import { toReportSubscriptionSummary } from './report-subscriptions.mapper';
import { computeNextRunAt } from './report-subscription-schedule.util';
import type {
  CreateReportSubscriptionDto,
  UpdateReportSubscriptionDto,
} from './dto/report-subscriptions.schemas';

@Injectable()
export class ReportSubscriptionsService {
  constructor(
    private readonly reportSubscriptionsRepository: ReportSubscriptionsRepository,
    private readonly senderAccountsRepository: SenderAccountsRepository,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  async create(
    dto: CreateReportSubscriptionDto,
    currentUserId: string,
  ): Promise<ReportSubscriptionSummary> {
    await this.assertSenderAccountExists(dto.senderAccountId);

    const nextRunAt = computeNextRunAt(
      {
        cadence: dto.cadence,
        hourOfDay: dto.hourOfDay,
        dayOfWeek: dto.dayOfWeek ?? null,
        dayOfMonth: dto.dayOfMonth ?? null,
      },
      new Date(),
    );

    const row = await this.reportSubscriptionsRepository.create({
      createdBy: currentUserId,
      name: dto.name,
      kind: dto.kind,
      format: dto.format,
      filterParams: dto.filterParams,
      cadence: dto.cadence,
      hourOfDay: dto.hourOfDay,
      dayOfWeek: dto.dayOfWeek ?? null,
      dayOfMonth: dto.dayOfMonth ?? null,
      recipientEmails: dto.recipientEmails,
      senderAccountId: dto.senderAccountId,
      isActive: dto.isActive,
      nextRunAt,
    });

    await this.auditLogsRepository.record({
      userId: currentUserId,
      action: 'report_subscription.create',
      entityType: 'report_subscription',
      entityId: row.id,
      metadata: { name: row.name, kind: row.kind, cadence: row.cadence },
    });

    return toReportSubscriptionSummary(row);
  }

  async list(): Promise<ReportSubscriptionSummary[]> {
    const rows = await this.reportSubscriptionsRepository.list();
    return rows.map(toReportSubscriptionSummary);
  }

  async get(id: string): Promise<ReportSubscriptionSummary> {
    const row = await this.reportSubscriptionsRepository.findById(id);
    if (!row) {
      throw new NotFoundException('Report subscription not found');
    }
    return toReportSubscriptionSummary(row);
  }

  async update(
    id: string,
    dto: UpdateReportSubscriptionDto,
    currentUserId: string,
  ): Promise<ReportSubscriptionSummary> {
    const existing = await this.reportSubscriptionsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Report subscription not found');
    }
    if (dto.senderAccountId) {
      await this.assertSenderAccountExists(dto.senderAccountId);
    }

    const cadence = dto.cadence ?? existing.cadence;
    const hourOfDay = dto.hourOfDay ?? existing.hour_of_day;
    const dayOfWeek = dto.dayOfWeek ?? existing.day_of_week;
    const dayOfMonth = dto.dayOfMonth ?? existing.day_of_month;
    if (cadence === 'weekly' && dayOfWeek === null) {
      throw new BadRequestException('dayOfWeek is required for weekly cadence');
    }
    if (cadence === 'monthly' && dayOfMonth === null) {
      throw new BadRequestException(
        'dayOfMonth is required for monthly cadence',
      );
    }

    const scheduleChanged =
      dto.cadence !== undefined ||
      dto.hourOfDay !== undefined ||
      dto.dayOfWeek !== undefined ||
      dto.dayOfMonth !== undefined;
    const nextRunAt = scheduleChanged
      ? computeNextRunAt(
          { cadence, hourOfDay, dayOfWeek, dayOfMonth },
          new Date(),
        )
      : undefined;

    const row = await this.reportSubscriptionsRepository.update(id, {
      name: dto.name,
      filterParams: dto.filterParams,
      cadence: dto.cadence,
      hourOfDay: dto.hourOfDay,
      dayOfWeek: dto.dayOfWeek,
      dayOfMonth: dto.dayOfMonth,
      recipientEmails: dto.recipientEmails,
      senderAccountId: dto.senderAccountId,
      isActive: dto.isActive,
      nextRunAt,
    });
    if (!row) {
      throw new NotFoundException('Report subscription not found');
    }

    await this.auditLogsRepository.record({
      userId: currentUserId,
      action: 'report_subscription.update',
      entityType: 'report_subscription',
      entityId: id,
      metadata: { name: row.name, isActive: row.is_active },
    });

    return toReportSubscriptionSummary(row);
  }

  async delete(id: string, currentUserId: string): Promise<void> {
    const existing = await this.reportSubscriptionsRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Report subscription not found');
    }
    await this.reportSubscriptionsRepository.delete(id);

    await this.auditLogsRepository.record({
      userId: currentUserId,
      action: 'report_subscription.delete',
      entityType: 'report_subscription',
      entityId: id,
      metadata: { name: existing.name },
    });
  }

  private async assertSenderAccountExists(
    senderAccountId: string,
  ): Promise<void> {
    const senderAccount =
      await this.senderAccountsRepository.findById(senderAccountId);
    if (!senderAccount) {
      throw new NotFoundException('Sender account not found');
    }
  }
}
