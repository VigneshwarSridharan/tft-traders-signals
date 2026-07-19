import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportSubscriptionsService } from './report-subscriptions.service';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { ReportSubscriptionsRepository } from '../database/report-subscriptions.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import type { ReportSubscriptionWithSenderRow } from '../database/report-subscriptions.repository';
import type { SenderAccountRow } from '../database/rows';

function buildRow(
  overrides: Partial<ReportSubscriptionWithSenderRow> = {},
): ReportSubscriptionWithSenderRow {
  return {
    id: 'sub-1',
    created_by: 'user-1',
    name: 'Weekly analytics',
    kind: 'analytics_pdf',
    format: 'pdf',
    filter_params: {},
    cadence: 'weekly',
    hour_of_day: 8,
    day_of_week: 1,
    day_of_month: null,
    recipient_emails: ['ops@example.com'],
    sender_account_id: 'sender-1',
    sender_account_email: 'sender@example.com',
    is_active: true,
    last_run_at: null,
    last_run_error: null,
    next_run_at: new Date('2026-07-20T08:00:00.000Z'),
    created_at: new Date('2026-07-19T00:00:00.000Z'),
    updated_at: new Date('2026-07-19T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ReportSubscriptionsService', () => {
  let reportSubscriptionsRepository: jest.Mocked<ReportSubscriptionsRepository>;
  let senderAccountsRepository: jest.Mocked<SenderAccountsRepository>;
  let auditLogsRepository: jest.Mocked<AuditLogsRepository>;
  let service: ReportSubscriptionsService;

  beforeEach(() => {
    reportSubscriptionsRepository = {
      create: jest.fn(),
      list: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findDue: jest.fn(),
      recordRun: jest.fn(),
    } as unknown as jest.Mocked<ReportSubscriptionsRepository>;
    senderAccountsRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<SenderAccountsRepository>;
    auditLogsRepository = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogsRepository>;

    service = new ReportSubscriptionsService(
      reportSubscriptionsRepository,
      senderAccountsRepository,
      auditLogsRepository,
    );
  });

  describe('create', () => {
    it('rejects an unknown sender account', async () => {
      senderAccountsRepository.findById.mockResolvedValue(null);

      await expect(
        service.create(
          {
            name: 'Weekly analytics',
            kind: 'analytics_pdf',
            format: 'pdf',
            filterParams: {},
            cadence: 'weekly',
            hourOfDay: 8,
            dayOfWeek: 1,
            recipientEmails: ['ops@example.com'],
            senderAccountId: 'missing',
            isActive: true,
          },
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(reportSubscriptionsRepository.create).not.toHaveBeenCalled();
    });

    it('computes nextRunAt and audit-logs the creation', async () => {
      senderAccountsRepository.findById.mockResolvedValue(
        {} as SenderAccountRow,
      );
      reportSubscriptionsRepository.create.mockResolvedValue(buildRow());

      const result = await service.create(
        {
          name: 'Weekly analytics',
          kind: 'analytics_pdf',
          format: 'pdf',
          filterParams: {},
          cadence: 'weekly',
          hourOfDay: 8,
          dayOfWeek: 1,
          recipientEmails: ['ops@example.com'],
          senderAccountId: 'sender-1',
          isActive: true,
        },
        'user-1',
      );

      expect(reportSubscriptionsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: 'user-1',
          name: 'Weekly analytics',
        }),
      );
      expect(auditLogsRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'report_subscription.create' }),
      );
      expect(result.id).toBe('sub-1');
    });
  });

  describe('update', () => {
    it('404s for an unknown subscription', async () => {
      reportSubscriptionsRepository.findById.mockResolvedValue(null);

      await expect(
        service.update('missing', { name: 'New name' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects switching to weekly cadence without dayOfWeek', async () => {
      reportSubscriptionsRepository.findById.mockResolvedValue(
        buildRow({ cadence: 'daily', day_of_week: null }),
      );

      await expect(
        service.update('sub-1', { cadence: 'weekly' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(reportSubscriptionsRepository.update).not.toHaveBeenCalled();
    });

    it('recomputes nextRunAt only when the schedule changes', async () => {
      reportSubscriptionsRepository.findById.mockResolvedValue(buildRow());
      reportSubscriptionsRepository.update.mockResolvedValue(
        buildRow({ name: 'Renamed' }),
      );

      await service.update('sub-1', { name: 'Renamed' }, 'user-1');

      expect(reportSubscriptionsRepository.update).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({ name: 'Renamed', nextRunAt: undefined }),
      );
    });
  });

  describe('delete', () => {
    it('404s for an unknown subscription', async () => {
      reportSubscriptionsRepository.findById.mockResolvedValue(null);

      await expect(service.delete('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(reportSubscriptionsRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes and audit-logs', async () => {
      reportSubscriptionsRepository.findById.mockResolvedValue(buildRow());

      await service.delete('sub-1', 'user-1');

      expect(reportSubscriptionsRepository.delete).toHaveBeenCalledWith(
        'sub-1',
      );
      expect(auditLogsRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'report_subscription.delete' }),
      );
    });
  });
});
