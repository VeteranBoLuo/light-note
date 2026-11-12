import type { ComparisonTable } from '@lightnote/shared/comparison-table';
import { serializeTable } from '@/utils/toolboxTextTools';

export function comparisonExportRows(table: ComparisonTable, label: (key: string) => string): string[][] {
  return [
    [label('source'), ...table.columns.map((c) => c.label)],
    ...table.rows.map((row) => [
      row.title,
      ...row.cells.map((cell) => {
        const value = cell.value || (cell.edited ? '—' : label(cell.status));
        const status = cell.edited
          ? 'edited'
          : cell.reviewed
            ? 'reviewed'
            : cell.status !== 'found' && cell.value
              ? cell.status
              : '';
        return status ? `${value} (${label(status)})` : value;
      }),
    ]),
  ];
}
export function comparisonCsv(rows: string[][]) {
  // Quoting CSV alone does not prevent spreadsheet formula evaluation.
  const safe = rows.map((row) => row.map((value) => (/^[\s]*[=+\-@\t\r]/u.test(value) ? `'${value}` : value)));
  return '\uFEFF' + serializeTable(safe, 'csv');
}
