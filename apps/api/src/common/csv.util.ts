function toCsvField(value: string): string {
  if (/["\n,]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsvRow(values: string[]): string {
  return values.map(toCsvField).join(',');
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string;
}

export function buildCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [toCsvRow(columns.map((column) => column.header))];
  for (const row of rows) {
    lines.push(toCsvRow(columns.map((column) => column.value(row))));
  }
  return lines.join('\n');
}
