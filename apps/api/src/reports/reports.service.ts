import { Injectable } from '@nestjs/common';
import type { AnalyticsKpisResponse, SentMailListItem } from '@tft/shared';
import { AnalyticsService } from '../analytics/analytics.service';
import type { AccessTokenPayload } from '../auth/jwt-payload.interface';
import { toCsvRow } from '../common/csv.util';
import { AuditLogsRepository } from '../database/audit-logs.repository';
import { SentMailService } from '../sent-mail/sent-mail.service';
import type {
  AnalyticsExportQueryDto,
  SentMailExportQueryDto,
  AnalyticsPdfQueryDto,
} from './dto/reports.schemas';
import { buildExcelBuffer, type ExcelColumn } from './excel.util';
import { buildAnalyticsPdfReport } from './pdf-report.util';

// Reports are on-demand admin/manager tooling, not the paginated dashboard
// list — cap well above any realistic single export so a filter mistake
// can't accidentally stream an unbounded result set.
const SENT_MAIL_EXPORT_ROW_CAP = 20_000;

export interface ExportFile {
  filename: string;
  contentType: string;
  buffer: Buffer;
}

const SENT_MAIL_COLUMNS: {
  header: string;
  value: (row: SentMailListItem) => string | number | null;
}[] = [
  { header: 'Recipient name', value: (row) => row.toName },
  { header: 'Recipient email', value: (row) => row.toEmail },
  { header: 'Subject', value: (row) => row.subject },
  {
    header: 'Sender account',
    value: (row) => row.senderAccountDisplayName ?? row.senderAccountEmail,
  },
  { header: 'Template', value: (row) => row.templateName },
  { header: 'Status', value: (row) => row.status },
  { header: 'Sent at', value: (row) => row.sentAt },
  { header: 'Opens', value: (row) => row.openCount },
  { header: 'Clicks', value: (row) => row.clickCount },
  { header: 'Replied at', value: (row) => row.repliedAt },
];

@Injectable()
export class ReportsService {
  constructor(
    private readonly sentMailService: SentMailService,
    private readonly analyticsService: AnalyticsService,
    private readonly auditLogsRepository: AuditLogsRepository,
  ) {}

  async exportSentMail(
    query: SentMailExportQueryDto,
    currentUser: AccessTokenPayload,
  ): Promise<ExportFile> {
    const { items } = await this.sentMailService.list(
      {
        search: query.search,
        status: query.status,
        senderAccountId: query.senderAccountId,
        templateId: query.templateId,
        tagId: query.tagId,
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        sort: query.sort,
        sortDir: query.sortDir,
        page: 1,
        pageSize: SENT_MAIL_EXPORT_ROW_CAP,
      },
      currentUser,
    );

    const file = await this.toFile(
      'sent-mail',
      SENT_MAIL_COLUMNS,
      items,
      query.format,
    );

    await this.auditLogsRepository.record({
      userId: currentUser.sub,
      action: 'report.export',
      entityType: 'report',
      entityId: null,
      metadata: {
        kind: 'sent_mail',
        format: query.format,
        rowCount: items.length,
      },
    });

    return file;
  }

  async exportAnalytics(
    query: AnalyticsExportQueryDto,
    currentUser: AccessTokenPayload,
  ): Promise<ExportFile> {
    const filter = {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      senderAccountId: query.senderAccountId,
      templateId: query.templateId,
      limit: query.limit,
    };

    const file = await this.buildAnalyticsExportFile(
      query.view,
      filter,
      query.format,
    );

    await this.auditLogsRepository.record({
      userId: currentUser.sub,
      action: 'report.export',
      entityType: 'report',
      entityId: null,
      metadata: { kind: 'analytics', view: query.view, format: query.format },
    });

    return file;
  }

  private async buildAnalyticsExportFile(
    view: AnalyticsExportQueryDto['view'],
    filter: {
      dateFrom?: Date;
      dateTo?: Date;
      senderAccountId?: string;
      templateId?: string;
      limit: number;
    },
    format: 'csv' | 'xlsx',
  ): Promise<ExportFile> {
    const baseFilter = {
      dateFrom: filter.dateFrom,
      dateTo: filter.dateTo,
      senderAccountId: filter.senderAccountId,
      templateId: filter.templateId,
    };
    switch (view) {
      case 'kpis': {
        const kpis = await this.analyticsService.getKpis(baseFilter);
        return this.toFile(
          'kpis',
          [
            { header: 'Metric', value: (row: [string, number]) => row[0] },
            { header: 'Current', value: (row: [string, number]) => row[1] },
          ],
          Object.entries(kpis.current) as [string, number][],
          format,
        );
      }
      case 'timeseries': {
        const points = await this.analyticsService.getTimeseries({
          ...baseFilter,
          grain: 'day',
        });
        return this.toFile(
          'timeseries',
          [
            { header: 'Date', value: (row) => row.periodStart },
            { header: 'Sent', value: (row) => row.sent },
            { header: 'Delivered', value: (row) => row.delivered },
            { header: 'Opens (total)', value: (row) => row.opensTotal },
            { header: 'Opens (unique)', value: (row) => row.opensUnique },
            { header: 'Clicks (total)', value: (row) => row.clicksTotal },
            { header: 'Clicks (unique)', value: (row) => row.clicksUnique },
          ],
          points,
          format,
        );
      }
      case 'templates': {
        const rows = await this.analyticsService.getTopTemplates({
          ...baseFilter,
          limit: filter.limit,
        });
        return this.toFile(
          'top-templates',
          [
            { header: 'Template', value: (row) => row.templateName },
            { header: 'Category', value: (row) => row.categoryName },
            { header: 'Sent', value: (row) => row.sent },
            { header: 'Delivered', value: (row) => row.delivered },
            { header: 'Opens (unique)', value: (row) => row.opensUnique },
            { header: 'Clicks (unique)', value: (row) => row.clicksUnique },
            { header: 'Open rate', value: (row) => row.openRate },
            { header: 'CTR', value: (row) => row.ctr },
          ],
          rows,
          format,
        );
      }
      case 'accounts': {
        const rows = await this.analyticsService.getTopAccounts({
          ...baseFilter,
          limit: filter.limit,
        });
        return this.toFile(
          'top-accounts',
          [
            {
              header: 'Sender account',
              value: (row) =>
                row.senderAccountDisplayName ?? row.senderAccountEmail,
            },
            { header: 'Sent', value: (row) => row.sent },
            { header: 'Delivered', value: (row) => row.delivered },
            { header: 'Opens (unique)', value: (row) => row.opensUnique },
            { header: 'Clicks (unique)', value: (row) => row.clicksUnique },
            { header: 'Open rate', value: (row) => row.openRate },
            { header: 'CTR', value: (row) => row.ctr },
          ],
          rows,
          format,
        );
      }
      case 'emails': {
        const rows = await this.analyticsService.getTopEmails({
          ...baseFilter,
          limit: filter.limit,
        });
        return this.toFile(
          'top-emails',
          [
            { header: 'Subject', value: (row) => row.subject },
            { header: 'Recipient', value: (row) => row.toEmail },
            { header: 'Sent at', value: (row) => row.sentAt },
            { header: 'Template', value: (row) => row.templateName },
            { header: 'Opens', value: (row) => row.openCount },
            { header: 'Clicks', value: (row) => row.clickCount },
          ],
          rows,
          format,
        );
      }
      case 'links': {
        const rows = await this.analyticsService.getTopLinks({
          ...baseFilter,
          limit: filter.limit,
        });
        return this.toFile(
          'top-links',
          [
            { header: 'URL', value: (row) => row.originalUrl },
            { header: 'Label', value: (row) => row.linkLabel },
            { header: 'Total clicks', value: (row) => row.totalClicks },
            { header: 'Times sent', value: (row) => row.timesSent },
          ],
          rows,
          format,
        );
      }
      case 'customers': {
        const rows = await this.analyticsService.getTopCustomers({
          ...baseFilter,
          limit: filter.limit,
        });
        return this.toFile(
          'top-customers',
          [
            { header: 'Name', value: (row) => row.name },
            { header: 'Email', value: (row) => row.email },
            { header: 'Company', value: (row) => row.company },
            { header: 'Sent', value: (row) => row.sent },
            { header: 'Opens (total)', value: (row) => row.opensTotal },
            { header: 'Clicks (total)', value: (row) => row.clicksTotal },
            { header: 'Messages opened', value: (row) => row.messagesOpened },
            {
              header: 'Messages clicked',
              value: (row) => row.messagesClicked,
            },
          ],
          rows,
          format,
        );
      }
    }
  }

  async generateAnalyticsPdf(
    query: AnalyticsPdfQueryDto,
    currentUser: AccessTokenPayload,
  ): Promise<ExportFile> {
    const filter = {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      senderAccountId: query.senderAccountId,
      templateId: query.templateId,
    };

    const [kpis, timeseries, topTemplates] = await Promise.all([
      this.analyticsService.getKpis(filter),
      this.analyticsService.getTimeseries({ ...filter, grain: 'day' }),
      this.analyticsService.getTopTemplates({ ...filter, limit: 10 }),
    ]);

    const buffer = await this.renderPdf({
      generatedAt: new Date(),
      kpis,
      timeseries,
      topTemplates,
    });

    await this.auditLogsRepository.record({
      userId: currentUser.sub,
      action: 'report.export',
      entityType: 'report',
      entityId: null,
      metadata: { kind: 'analytics_pdf', format: 'pdf' },
    });

    return {
      filename: `analytics-report-${this.timestampSlug()}.pdf`,
      contentType: 'application/pdf',
      buffer,
    };
  }

  private renderPdf(input: {
    generatedAt: Date;
    kpis: AnalyticsKpisResponse;
    timeseries: Awaited<ReturnType<AnalyticsService['getTimeseries']>>;
    topTemplates: Awaited<ReturnType<AnalyticsService['getTopTemplates']>>;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = buildAnalyticsPdfReport(input);
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });
  }

  private async toFile<T>(
    baseName: string,
    columns: ExcelColumn<T>[],
    rows: T[],
    format: 'csv' | 'xlsx',
  ): Promise<ExportFile> {
    const slug = this.timestampSlug();
    if (format === 'xlsx') {
      const buffer = await buildExcelBuffer(baseName, columns, rows);
      return {
        filename: `${baseName}-${slug}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer,
      };
    }
    const lines = [toCsvRow(columns.map((column) => column.header))];
    for (const row of rows) {
      lines.push(
        toCsvRow(columns.map((column) => this.toCsvValue(column.value(row)))),
      );
    }
    return {
      filename: `${baseName}-${slug}.csv`,
      contentType: 'text/csv; charset=utf-8',
      buffer: Buffer.from(lines.join('\n'), 'utf-8'),
    };
  }

  private toCsvValue(value: string | number | null): string {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  private timestampSlug(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }
}
