import type { ComparisonColumn, ComparisonTable } from '@lightnote/shared/comparison-table';
import { COMPARISON_MAX_COLUMNS } from '@lightnote/shared/comparison-table';
import { serializeTable } from '@/utils/toolboxTextTools';

export function suggestComparisonColumns(question: string, fallback: string): ComparisonColumn[] {
  const labels = question
    .trim()
    .replace(/^(?:请|帮我|比较|对比|compare|contrast)\s*/giu, '')
    .replace(/^.*?(?:的|\bon\b|\bby\b|\bacross\b)\s*/iu, '')
    .replace(/[。.!！?？]+$/u, '')
    .split(/[,，、;；\n]|以及|和|\band\b/iu)
    .map((value) => value.trim())
    .filter((value) => value && value.length <= 40);
  const selected = labels.length >= 2 ? labels : fallback.split(/[,、]/u);
  return [...new Set(selected)].slice(0, COMPARISON_MAX_COLUMNS).map((label) => ({ label, type: 'auto', rule: '' }));
}
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
