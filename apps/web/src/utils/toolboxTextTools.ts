export type TableFormat = 'csv' | 'tsv' | 'json' | 'markdown';

export class ToolboxTextError extends Error {
  constructor(
    public readonly code: 'INPUT_TOO_LARGE' | 'INVALID_TABLE',
  ) {
    super(code);
    this.name = 'ToolboxTextError';
  }
}

export interface TableLimits {
  maxRows?: number;
  maxCharacters?: number;
}
function normalizeTable(table: unknown[][], limits: TableLimits = {}) {
  if (!table.length) throw new ToolboxTextError('INVALID_TABLE');
  if (table.length > (limits.maxRows ?? 5_000)) throw new ToolboxTextError('INPUT_TOO_LARGE');
  const columns = Math.max(...table.map((row) => row.length));
  if (!columns || columns > 200) throw new ToolboxTextError('INVALID_TABLE');
  return table.map((row) => Array.from({ length: columns }, (_, index) => String(row[index] ?? '')));
}

export function parseDelimitedTable(source: string, delimiter: ',' | '\t', limits: TableLimits = {}) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const value = String(source || '').replace(/\r\n?/gu, '\n');
  if (value.length > (limits.maxCharacters ?? 1_000_000)) throw new ToolboxTextError('INPUT_TOO_LARGE');

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && !cell) quoted = true;
    else if (character === delimiter) {
      row.push(cell);
      if (row.length > 200) throw new ToolboxTextError('INVALID_TABLE');
      cell = '';
    } else if (character === '\n') {
      row.push(cell);
      rows.push(row);
      if (rows.length > (limits.maxRows ?? 5000)) throw new ToolboxTextError('INPUT_TOO_LARGE');
      row = [];
      cell = '';
    } else cell += character;
  }
  if (quoted) throw new ToolboxTextError('INVALID_TABLE');
  row.push(cell);
  rows.push(row);
  if (rows.length > 1 && rows.at(-1)?.every((entry) => entry === '') && value.endsWith('\n')) rows.pop();
  return normalizeTable(rows, limits);
}

function escapeDelimitedCell(value: string, delimiter: string) {
  return /["\r\n]/u.test(value) || value.includes(delimiter) ? `"${value.replace(/"/gu, '""')}"` : value;
}

function serializeDelimited(table: string[][], delimiter: ',' | '\t') {
  return table.map((row) => row.map((cell) => escapeDelimitedCell(cell, delimiter)).join(delimiter)).join('\n');
}

function serializeMarkdown(table: string[][]) {
  const escape = (value: string) => value.replace(/\\/gu, '\\\\').replace(/\|/gu, '\\|').replace(/\r?\n/gu, '<br>');
  const header = table[0]!.map(escape);
  const body = table.slice(1).map((row) => row.map(escape));
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

function serializeJson(table: string[][]) {
  const usedHeaders = new Set<string>();
  const headers = table[0]!.map((header, index) => {
    const base = header.trim() || `column_${index + 1}`;
    let candidate = base;
    let suffix = 2;
    while (usedHeaders.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    usedHeaders.add(candidate);
    return candidate;
  });
  return JSON.stringify(
    table.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))),
    null,
    2,
  );
}

export function serializeTable(table: string[][], format: TableFormat, limits: TableLimits = {}) {
  const normalized = normalizeTable(table, limits);
  if (format === 'csv') return serializeDelimited(normalized, ',');
  if (format === 'tsv') return serializeDelimited(normalized, '\t');
  if (format === 'json') return serializeJson(normalized);
  return serializeMarkdown(normalized);
}
