import type {
  SentMailListItem,
  TemplateLeaderboardResponse,
} from '@tft/shared';
import { AnalyticsService } from '../analytics/analytics.service';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { SentMailService } from '../sent-mail/sent-mail.service';
import { ReportsService } from './reports.service';

function buildSentMailItem(
  overrides: Partial<SentMailListItem> = {},
): SentMailListItem {
  return {
    id: 'message-1',
    toEmail: 'jane@acme.com',
    toName: 'Jane Doe',
    subject: 'Your quotation',
    senderAccountId: 'sender-1',
    senderAccountEmail: 'sales@company.com',
    senderAccountDisplayName: 'Sales Team',
    templateId: 'template-1',
    templateName: 'Quotation',
    status: 'delivered',
    sentAt: '2026-07-01T00:00:00.000Z',
    queuedAt: '2026-07-01T00:00:00.000Z',
    openCount: 2,
    clickCount: 1,
    repliedAt: null,
    bounceType: 'none',
    tags: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

const CURRENT_USER: AccessTokenPayload = {
  sub: 'user-1',
  email: 'admin@company.com',
  role: 'admin',
};

function lastAuditMetadata(
  auditLogsRepository: jest.Mocked<AuditLogsRepository>,
): Record<string, unknown> {
  const calls = auditLogsRepository.record.mock.calls;
  const [input] = calls[calls.length - 1];
  return input.metadata;
}

describe('ReportsService', () => {
  let sentMailService: jest.Mocked<SentMailService>;
  let analyticsService: jest.Mocked<AnalyticsService>;
  let auditLogsRepository: jest.Mocked<AuditLogsRepository>;
  let service: ReportsService;

  beforeEach(() => {
    sentMailService = {
      list: jest.fn(),
    } as unknown as jest.Mocked<SentMailService>;

    analyticsService = {
      getKpis: jest.fn(),
      getTimeseries: jest.fn(),
      getTopTemplates: jest.fn(),
      getTopAccounts: jest.fn(),
      getTopEmails: jest.fn(),
      getTopLinks: jest.fn(),
      getTopCustomers: jest.fn(),
    } as unknown as jest.Mocked<AnalyticsService>;

    auditLogsRepository = {
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<AuditLogsRepository>;

    service = new ReportsService(
      sentMailService,
      analyticsService,
      auditLogsRepository,
    );
  });

  describe('exportSentMail', () => {
    it('builds a CSV with one row per message and audit-logs the export', async () => {
      sentMailService.list.mockResolvedValue({
        items: [buildSentMailItem()],
        total: 1,
        page: 1,
        pageSize: 20_000,
      });

      const file = await service.exportSentMail(
        { format: 'csv', sort: 'sentAt', sortDir: 'desc' },
        CURRENT_USER,
      );

      expect(file.contentType).toBe('text/csv; charset=utf-8');
      expect(file.filename).toMatch(/^sent-mail-.*\.csv$/);
      const text = file.buffer.toString('utf-8');
      const [header, row] = text.split('\n');
      expect(header).toContain('Recipient email');
      expect(row).toContain('jane@acme.com');
      expect(row).toContain('Your quotation');

      expect(auditLogsRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'report.export',
          entityType: 'report',
        }),
      );
      expect(lastAuditMetadata(auditLogsRepository)).toMatchObject({
        kind: 'sent_mail',
        format: 'csv',
        rowCount: 1,
      });
    });

    it('caps the fetched page size well above the dashboard page size and scopes to the requesting user via SentMailService', async () => {
      sentMailService.list.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20_000,
      });

      await service.exportSentMail(
        { format: 'xlsx', sort: 'sentAt', sortDir: 'desc' },
        CURRENT_USER,
      );

      expect(sentMailService.list).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 20_000 }),
        CURRENT_USER,
      );
    });

    it('produces a non-empty xlsx workbook buffer', async () => {
      sentMailService.list.mockResolvedValue({
        items: [buildSentMailItem()],
        total: 1,
        page: 1,
        pageSize: 20_000,
      });

      const file = await service.exportSentMail(
        { format: 'xlsx', sort: 'sentAt', sortDir: 'desc' },
        CURRENT_USER,
      );

      expect(file.filename).toMatch(/\.xlsx$/);
      expect(file.contentType).toContain('spreadsheetml');
      // xlsx files are zip archives, which start with the "PK" magic bytes.
      expect(file.buffer.subarray(0, 2).toString('ascii')).toBe('PK');
    });
  });

  describe('exportAnalytics', () => {
    it('exports the kpis view as metric/value pairs', async () => {
      analyticsService.getKpis.mockResolvedValue({
        current: {
          sent: 10,
          delivered: 9,
          deliveryRate: 0.9,
          opensTotal: 5,
          opensUnique: 4,
          openRate: 0.44,
          clicksTotal: 2,
          clicksUnique: 2,
          ctr: 0.22,
          ctor: 0.5,
          bouncedHard: 1,
          bouncedSoft: 0,
          bounceRate: 0.1,
          replies: 1,
          replyRate: 0.1,
          unsubscribes: 0,
        },
        previous: {} as never,
        deltas: {} as never,
        currentPeriod: { dateFrom: '2026-06-01', dateTo: '2026-06-30' },
        previousPeriod: { dateFrom: '2026-05-01', dateTo: '2026-05-31' },
      });

      const file = await service.exportAnalytics(
        { view: 'kpis', format: 'csv', limit: 10 },
        CURRENT_USER,
      );

      const text = file.buffer.toString('utf-8');
      expect(text).toContain('sent,10');
      expect(auditLogsRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'report.export' }),
      );
      expect(lastAuditMetadata(auditLogsRepository)).toMatchObject({
        kind: 'analytics',
        view: 'kpis',
      });
    });

    it('exports a leaderboard view using the requested limit', async () => {
      const rows: TemplateLeaderboardResponse = [
        {
          templateId: 'tmpl-1',
          templateName: 'Quotation',
          categoryName: 'Sales',
          sent: 20,
          delivered: 18,
          opensUnique: 10,
          clicksUnique: 4,
          openRate: 0.55,
          ctr: 0.22,
        },
      ];
      analyticsService.getTopTemplates.mockResolvedValue(rows);

      const file = await service.exportAnalytics(
        { view: 'templates', format: 'csv', limit: 5 },
        CURRENT_USER,
      );

      expect(analyticsService.getTopTemplates).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5 }),
      );
      expect(file.buffer.toString('utf-8')).toContain('Quotation');
    });
  });

  describe('generateAnalyticsPdf', () => {
    it('renders a PDF buffer and audit-logs the export', async () => {
      analyticsService.getKpis.mockResolvedValue({
        current: {
          sent: 10,
          delivered: 9,
          deliveryRate: 0.9,
          opensTotal: 5,
          opensUnique: 4,
          openRate: 0.44,
          clicksTotal: 2,
          clicksUnique: 2,
          ctr: 0.22,
          ctor: 0.5,
          bouncedHard: 1,
          bouncedSoft: 0,
          bounceRate: 0.1,
          replies: 1,
          replyRate: 0.1,
          unsubscribes: 0,
        },
        previous: {} as never,
        deltas: {} as never,
        currentPeriod: { dateFrom: '2026-06-01', dateTo: '2026-06-30' },
        previousPeriod: { dateFrom: '2026-05-01', dateTo: '2026-05-31' },
      });
      analyticsService.getTimeseries.mockResolvedValue([
        {
          periodStart: '2026-06-01',
          sent: 5,
          delivered: 4,
          opensTotal: 2,
          opensUnique: 2,
          clicksTotal: 1,
          clicksUnique: 1,
        },
      ]);
      analyticsService.getTopTemplates.mockResolvedValue([]);

      const file = await service.generateAnalyticsPdf({}, CURRENT_USER);

      expect(file.contentType).toBe('application/pdf');
      expect(file.filename).toMatch(/^analytics-report-.*\.pdf$/);
      expect(file.buffer.subarray(0, 4).toString('ascii')).toBe('%PDF');
      expect(auditLogsRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'report.export' }),
      );
      expect(lastAuditMetadata(auditLogsRepository)).toMatchObject({
        kind: 'analytics_pdf',
      });
    });
  });
});
