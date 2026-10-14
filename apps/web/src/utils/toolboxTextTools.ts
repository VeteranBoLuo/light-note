import { noteContentToHtml } from '@/utils/common';
import { noteHtmlToMarkdown } from '@/utils/noteHtmlToMarkdown';

export type MarkupDirection = 'markdown_to_html' | 'html_to_markdown';
export type TableFormat = 'csv' | 'tsv' | 'json' | 'markdown';

export class ToolboxTextError extends Error {
  constructor(
    public readonly code: 'INPUT_TOO_LARGE' | 'DIFF_TOO_COMPLEX' | 'INVALID_TABLE' | 'INVALID_JSON' | 'SAME_FORMAT',
  ) {
    super(code);
    this.name = 'ToolboxTextError';
  }
}

export async function convertMarkup(source: string, direction: MarkupDirection) {
  const value = String(source || '');
  if (value.length > 500_000) throw new ToolboxTextError('INPUT_TOO_LARGE');
  return direction === 'markdown_to_html' ? noteContentToHtml(value, 'markdown') : noteHtmlToMarkdown(value);
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

function splitMarkdownRow(line: string) {
  const trimmed = line.trim().replace(/^\|/u, '').replace(/\|$/u, '');
  const cells: string[] = [];
  let cell = '';
  let escaped = false;
  for (const character of trimmed) {
    if (escaped) {
      cell += character;
      escaped = false;
    } else if (character === '\\') escaped = true;
    else if (character === '|') {
      cells.push(cell.trim());
      cell = '';
    } else cell += character;
  }
  if (escaped) cell += '\\';
  cells.push(cell.trim());
  return cells;
}

function parseMarkdownTable(source: string, limits: TableLimits) {
  const lines = String(source || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .filter((line) => line.trim());
  if (lines.length < 2) throw new ToolboxTextError('INVALID_TABLE');
  if (lines.length - 1 > (limits.maxRows ?? 5000)) throw new ToolboxTextError('INPUT_TOO_LARGE');
  const rows = lines.map(splitMarkdownRow);
  const separator = rows[1];
  if (!separator?.length || !separator.every((cell) => /^:?-{3,}:?$/u.test(cell.trim()))) {
    throw new ToolboxTextError('INVALID_TABLE');
  }
  rows.splice(1, 1);
  return normalizeTable(rows, limits);
}

function parseJsonTable(source: string, limits: TableLimits) {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new ToolboxTextError('INVALID_JSON');
  }
  if (!Array.isArray(value) || !value.length) throw new ToolboxTextError('INVALID_JSON');
  if (value.length + 1 > (limits.maxRows ?? 5000)) throw new ToolboxTextError('INPUT_TOO_LARGE');
  if (value.every((entry) => Array.isArray(entry))) {
    const arrays = value as unknown[][];
    const columns = Math.max(...arrays.map((entry) => entry.length));
    if (!columns || columns > 200) throw new ToolboxTextError('INVALID_TABLE');
    return normalizeTable([Array.from({ length: columns }, (_, index) => `column_${index + 1}`), ...arrays], limits);
  }
  if (!value.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))) {
    throw new ToolboxTextError('INVALID_JSON');
  }
  const records = value as Record<string, unknown>[];
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  if (!headers.length || headers.length > 200) throw new ToolboxTextError('INVALID_TABLE');
  return normalizeTable(
    [
      headers,
      ...records.map((record) =>
        headers.map((header) => {
          const cell = record[header];
          return cell != null && typeof cell === 'object' ? JSON.stringify(cell) : String(cell ?? '');
        }),
      ),
    ],
    limits,
  );
}

export function parseTable(source: string, format: TableFormat, limits: TableLimits = {}) {
  if (String(source || '').length > (limits.maxCharacters ?? 1_000_000)) throw new ToolboxTextError('INPUT_TOO_LARGE');
  if (format === 'csv') return parseDelimitedTable(source, ',', limits);
  if (format === 'tsv') return parseDelimitedTable(source, '\t', limits);
  if (format === 'json') return parseJsonTable(source, limits);
  return parseMarkdownTable(source, limits);
}

/** Guess only the container/delimiter; parsing still validates the complete input. */
export function detectTableFormat(source: string): TableFormat {
  const sample = source
    .replace(/^\uFEFF/u, '')
    .trimStart()
    .slice(0, 8192);
  if (sample.startsWith('[') || sample.startsWith('{')) return 'json';
  const lines = sample.split(/\r?\n/u).filter((line) => line.trim());
  if (lines[1] && splitMarkdownRow(lines[1]).every((cell) => /^:?-{3,}:?$/u.test(cell.trim()))) return 'markdown';
  let quoted = false,
    tabs = 0,
    commas = 0;
  for (let index = 0; index < sample.length; index++) {
    const character = sample[index];
    if (character === '"') {
      if (quoted && sample[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (character === '\t') tabs++;
      if (character === ',') commas++;
    }
  }
  return tabs > commas ? 'tsv' : 'csv';
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

export function convertTable(
  source: string,
  inputFormat: TableFormat,
  outputFormat: TableFormat,
  firstRowHeader = true,
) {
  if (inputFormat === outputFormat) throw new ToolboxTextError('SAME_FORMAT');
  const table = parseTable(source.replace(/^\uFEFF/, ''), inputFormat);
  if (!firstRowHeader && (inputFormat === 'csv' || inputFormat === 'tsv'))
    table.unshift(table[0]!.map((_cell, index) => `column_${index + 1}`));
  return {
    table,
    output: serializeTable(table, outputFormat),
    rows: Math.max(0, table.length - 1),
    columns: table[0]?.length || 0,
  };
}
