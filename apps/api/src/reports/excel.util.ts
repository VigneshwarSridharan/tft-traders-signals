import ExcelJS from 'exceljs';

export interface ExcelColumn<T> {
  header: string;
  value: (row: T) => string | number | null;
  width?: number;
}

export async function buildExcelBuffer<T>(
  sheetName: string,
  columns: ExcelColumn<T>[],
  rows: T[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.header,
    width: column.width ?? 20,
  }));
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow(columns.map((column) => column.value(row)));
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
