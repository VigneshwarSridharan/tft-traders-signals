import { ReportSubscriptionRunnerService } from './report-subscription-runner.service';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { ReportSubscriptionsRepository } from '../database/report-subscriptions.repository';
import type { ReportSubscriptionWithSenderRow } from '../database/report-subscriptions.repository';
import { SenderAccountsRepository } from '../database/sender-accounts.repository';
import { UsersRepository } from '../database/users.repository';
import type { SenderAccountRow, UserRow } from '../database/rows';
import { EmailSenderService } from '../send/email-sender.service';
import { ReportsService, type ExportFile } from '../reports/reports.service';

function buildSubscription(
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
    recipient_emails: ['ops@example.com', 'lead@example.com'],
    sender_account_id: 'sender-1',
    sender_account_email: 'sender@example.com',
    is_active: true,
    last_run_at: null,
    last_run_error: null,
    next_run_at: new Date('2026-07-19T08:00:00.000Z'),
    created_at: new Date('2026-07-01T00:00:00.000Z'),
    updated_at: new Date('2026-07-01T00:00:00.000Z'),
    ...overrides,
  };
}

const CREATOR: UserRow = {
  id: 'user-1',
  email: 'manager@example.com',
  name: 'Manager',
  password_hash: 'hash',
  role: 'manager',
  is_active: true,
  last_login_at: null,
  theme: 'system',
  notification_prefs: {},
  created_at: new Date(),
  updated_at: new Date(),
};

const SENDER_ACCOUNT: SenderAccountRow = {
  id: 'sender-1',
  email: 'sender@example.com',
  display_name: 'Sender',
  smtp_host: 'smtp.example.com',
  smtp_port: 465,
  imap_host: 'imap.example.com',
  imap_port: 993,
  credential_enc: Buffer.from('enc'),
  signature_html: null,
  daily_quota: null,
  hourly_quota: null,
  status: 'active',
  last_verified_at: new Date(),
  imap_last_uid: '0',
  created_at: new Date(),
  updated_at: new Date(),
};

const EXPORT_FILE: ExportFile = {
  filename: 'analytics-report-2026-07-19.pdf',
  contentType: 'application/pdf',
  buffer: Buffer.from('pdf-bytes'),
};

describe('ReportSubscriptionRunnerService', () => {
  let reportSubscriptionsRepository: jest.Mocked<ReportSubscriptionsRepository>;
  let senderAccountsRepository: jest.Mocked<SenderAccountsRepository>;
  let usersRepository: jest.Mocked<UsersRepository>;
  let reportsService: jest.Mocked<ReportsService>;
  let emailSenderService: jest.Mocked<EmailSenderService>;
  let auditLogsRepository: jest.Mocked<AuditLogsRepository>;
  let service: ReportSubscriptionRunnerService;

  beforeEach(() => {
    reportSubscriptionsRepository = {
      findDue: jest.fn(),
      recordRun: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ReportSubscriptionsRepository>;
    senderAccountsRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<SenderAccountsRepository>;
    usersRepository = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;
    reportsService = {
      generateAnalyticsPdf: jest.fn(),
      exportSentMail: jest.fn(),
    } as unknown as jest.Mocked<ReportsService>;
    emailSenderService = {
      sendNow: jest.fn().mockResolvedValue('250 OK'),
    } as unknown as jest.Mocked<EmailSenderService>;
    auditLogsRepository = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogsRepository>;

    service = new ReportSubscriptionRunnerService(
      reportSubscriptionsRepository,
      senderAccountsRepository,
      usersRepository,
      reportsService,
      emailSenderService,
      auditLogsRepository,
    );
  });

  it('does nothing when no subscriptions are due', async () => {
    reportSubscriptionsRepository.findDue.mockResolvedValue([]);

    await service.runDue(new Date('2026-07-19T08:00:00.000Z'));

    expect(emailSenderService.sendNow).not.toHaveBeenCalled();
    expect(reportSubscriptionsRepository.recordRun).not.toHaveBeenCalled();
  });

  it('generates the analytics PDF, emails it as an attachment, and advances next_run_at', async () => {
    const subscription = buildSubscription();
    reportSubscriptionsRepository.findDue.mockResolvedValue([subscription]);
    usersRepository.findById.mockResolvedValue(CREATOR);
    senderAccountsRepository.findById.mockResolvedValue(SENDER_ACCOUNT);
    reportsService.generateAnalyticsPdf.mockResolvedValue(EXPORT_FILE);

    const now = new Date('2026-07-19T08:00:00.000Z');
    await service.runDue(now);

    expect(reportsService.generateAnalyticsPdf).toHaveBeenCalledTimes(1);
    const [pdfQuery, pdfCurrentUser] =
      reportsService.generateAnalyticsPdf.mock.calls[0];
    expect(pdfQuery.dateFrom).toBeInstanceOf(Date);
    expect(pdfQuery.dateTo).toBe(now);
    expect(pdfCurrentUser).toEqual(
      expect.objectContaining({ sub: 'user-1', role: 'manager' }),
    );
    expect(emailSenderService.sendNow).toHaveBeenCalledWith(
      expect.objectContaining({
        senderAccount: SENDER_ACCOUNT,
        to: 'ops@example.com, lead@example.com',
        attachments: [
          expect.objectContaining({ filename: EXPORT_FILE.filename }),
        ],
      }),
    );
    expect(reportSubscriptionsRepository.recordRun).toHaveBeenCalledWith(
      'sub-1',
      expect.objectContaining({ ranAt: now, error: null }),
    );
    const recordedNextRunAt =
      reportSubscriptionsRepository.recordRun.mock.calls[0][1].nextRunAt;
    expect(recordedNextRunAt.getTime()).toBeGreaterThan(now.getTime());
    expect(auditLogsRepository.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'report_subscription.run' }),
    );
  });

  it('calls the sent-mail export for a sent_mail subscription', async () => {
    const subscription = buildSubscription({
      kind: 'sent_mail',
      format: 'csv',
    });
    reportSubscriptionsRepository.findDue.mockResolvedValue([subscription]);
    usersRepository.findById.mockResolvedValue(CREATOR);
    senderAccountsRepository.findById.mockResolvedValue(SENDER_ACCOUNT);
    reportsService.exportSentMail.mockResolvedValue({
      ...EXPORT_FILE,
      filename: 'sent-mail-2026-07-19.csv',
      contentType: 'text/csv',
    });

    await service.runDue(new Date('2026-07-19T08:00:00.000Z'));

    expect(reportsService.exportSentMail).toHaveBeenCalledWith(
      expect.objectContaining({
        format: 'csv',
        sort: 'sentAt',
        sortDir: 'desc',
      }),
      expect.anything(),
    );
    expect(emailSenderService.sendNow).toHaveBeenCalled();
  });

  it('records the error and still advances next_run_at when the sender account is disabled', async () => {
    const subscription = buildSubscription();
    reportSubscriptionsRepository.findDue.mockResolvedValue([subscription]);
    usersRepository.findById.mockResolvedValue(CREATOR);
    senderAccountsRepository.findById.mockResolvedValue({
      ...SENDER_ACCOUNT,
      status: 'disabled',
    });

    const now = new Date('2026-07-19T08:00:00.000Z');
    await service.runDue(now);

    expect(emailSenderService.sendNow).not.toHaveBeenCalled();
    expect(reportSubscriptionsRepository.recordRun).toHaveBeenCalledTimes(1);
    const [recordedId, recordedRun] =
      reportSubscriptionsRepository.recordRun.mock.calls[0];
    expect(recordedId).toBe('sub-1');
    expect(recordedRun.ranAt).toBe(now);
    expect(recordedRun.error).toContain('disabled');
    expect(auditLogsRepository.record).not.toHaveBeenCalled();
  });

  it('does not let one failing subscription block the next', async () => {
    const failing = buildSubscription({ id: 'sub-fail', created_by: 'ghost' });
    const succeeding = buildSubscription({ id: 'sub-ok' });
    reportSubscriptionsRepository.findDue.mockResolvedValue([
      failing,
      succeeding,
    ]);
    usersRepository.findById.mockImplementation((id: string) =>
      Promise.resolve(id === 'ghost' ? null : CREATOR),
    );
    senderAccountsRepository.findById.mockResolvedValue(SENDER_ACCOUNT);
    reportsService.generateAnalyticsPdf.mockResolvedValue(EXPORT_FILE);

    await service.runDue(new Date('2026-07-19T08:00:00.000Z'));

    expect(reportSubscriptionsRepository.recordRun).toHaveBeenCalledTimes(2);
    const failedCall = reportSubscriptionsRepository.recordRun.mock.calls.find(
      ([id]) => id === 'sub-fail',
    );
    expect(typeof failedCall?.[1].error).toBe('string');
    expect(reportSubscriptionsRepository.recordRun).toHaveBeenCalledWith(
      'sub-ok',
      expect.objectContaining({ error: null }),
    );
    expect(emailSenderService.sendNow).toHaveBeenCalledTimes(1);
  });
});
