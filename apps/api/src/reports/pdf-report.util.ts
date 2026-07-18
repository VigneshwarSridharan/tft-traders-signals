import PDFDocument from 'pdfkit';
import type {
  AnalyticsKpisResponse,
  AnalyticsTimeseriesResponse,
  TemplateLeaderboardResponse,
} from '@tft/shared';

export interface PdfReportInput {
  generatedAt: Date;
  kpis: AnalyticsKpisResponse;
  timeseries: AnalyticsTimeseriesResponse;
  topTemplates: TemplateLeaderboardResponse;
}

const MARGIN = 50;
const PAGE_WIDTH = 612; // US Letter, points
const CHART_WIDTH = PAGE_WIDTH - MARGIN * 2;
const CHART_HEIGHT = 160;

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Draws a minimal bar chart (no external chart library) for the "sent" series. */
function drawSentBarChart(
  doc: PDFKit.PDFDocument,
  points: AnalyticsTimeseriesResponse,
  originX: number,
  originY: number,
): void {
  doc
    .rect(originX, originY, CHART_WIDTH, CHART_HEIGHT)
    .strokeColor('#d4d4d8')
    .stroke();

  if (points.length === 0) {
    doc
      .fontSize(9)
      .fillColor('#71717a')
      .text(
        'No data for this period.',
        originX + 8,
        originY + CHART_HEIGHT / 2 - 5,
      );
    return;
  }

  const maxSent = Math.max(1, ...points.map((point) => point.sent));
  const barGap = 4;
  const barWidth = Math.max(
    2,
    (CHART_WIDTH - barGap * (points.length - 1)) / points.length,
  );

  points.forEach((point, index) => {
    const barHeight = (point.sent / maxSent) * (CHART_HEIGHT - 20);
    const x = originX + index * (barWidth + barGap);
    const y = originY + CHART_HEIGHT - barHeight;
    doc.rect(x, y, barWidth, barHeight).fillColor('#3b82f6').fill();
  });

  doc
    .fontSize(8)
    .fillColor('#52525b')
    .text(points[0].periodStart, originX, originY + CHART_HEIGHT + 4, {
      width: CHART_WIDTH / 2,
    })
    .text(
      points[points.length - 1].periodStart,
      originX,
      originY + CHART_HEIGHT + 4,
      { width: CHART_WIDTH, align: 'right' },
    );
}

function drawKpiGrid(
  doc: PDFKit.PDFDocument,
  kpis: AnalyticsKpisResponse,
  originY: number,
): number {
  const tiles: [string, string][] = [
    ['Sent', String(kpis.current.sent)],
    ['Delivered', String(kpis.current.delivered)],
    ['Delivery rate', formatPercent(kpis.current.deliveryRate)],
    ['Opens (unique)', String(kpis.current.opensUnique)],
    ['Open rate', formatPercent(kpis.current.openRate)],
    ['Clicks (unique)', String(kpis.current.clicksUnique)],
    ['CTR', formatPercent(kpis.current.ctr)],
    ['Bounce rate', formatPercent(kpis.current.bounceRate)],
    ['Reply rate', formatPercent(kpis.current.replyRate)],
  ];

  const columns = 3;
  const tileWidth = CHART_WIDTH / columns;
  const tileHeight = 44;

  tiles.forEach(([label, value], index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = MARGIN + col * tileWidth;
    const y = originY + row * tileHeight;
    doc.fontSize(8).fillColor('#71717a').text(label, x, y);
    doc
      .fontSize(14)
      .fillColor('#18181b')
      .text(value, x, y + 12);
  });

  return originY + Math.ceil(tiles.length / columns) * tileHeight;
}

export function buildAnalyticsPdfReport(
  input: PdfReportInput,
): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN });

  doc.fontSize(18).fillColor('#18181b').text('Email engagement report');
  doc
    .fontSize(10)
    .fillColor('#71717a')
    .text(
      `${input.kpis.currentPeriod.dateFrom} – ${input.kpis.currentPeriod.dateTo}`,
    )
    .text(`Generated ${input.generatedAt.toISOString()}`);

  doc.moveDown(1);
  doc.fontSize(12).fillColor('#18181b').text('Key metrics');
  const afterKpis = drawKpiGrid(doc, input.kpis, doc.y + 8);

  doc
    .fontSize(12)
    .fillColor('#18181b')
    .text('Sent volume over time', MARGIN, afterKpis + 12);
  drawSentBarChart(doc, input.timeseries, MARGIN, afterKpis + 32);

  const afterChart = afterKpis + 32 + CHART_HEIGHT + 24;
  doc
    .fontSize(12)
    .fillColor('#18181b')
    .text('Top templates', MARGIN, afterChart);

  let rowY = afterChart + 20;
  doc.fontSize(9).fillColor('#71717a');
  doc.text('Template', MARGIN, rowY, { width: 200 });
  doc.text('Sent', MARGIN + 200, rowY, { width: 60 });
  doc.text('Open rate', MARGIN + 260, rowY, { width: 80 });
  doc.text('CTR', MARGIN + 340, rowY, { width: 80 });
  rowY += 14;

  doc.fillColor('#18181b');
  for (const template of input.topTemplates.slice(0, 10)) {
    doc.fontSize(9);
    doc.text(template.templateName, MARGIN, rowY, { width: 200 });
    doc.text(String(template.sent), MARGIN + 200, rowY, { width: 60 });
    doc.text(formatPercent(template.openRate), MARGIN + 260, rowY, {
      width: 80,
    });
    doc.text(formatPercent(template.ctr), MARGIN + 340, rowY, { width: 80 });
    rowY += 14;
  }
  if (input.topTemplates.length === 0) {
    doc
      .fontSize(9)
      .fillColor('#71717a')
      .text('No sends in this period.', MARGIN, rowY);
  }

  doc.end();
  return doc;
}
