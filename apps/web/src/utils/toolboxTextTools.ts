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

export interface TextDiffOptions {
  ignoreCase: boolean;
  ignoreWhitespace: boolean;
}

export interface TextDiffRow {
  id: number;
  kind: 'equal' | 'changed' | 'added' | 'removed';
  leftLine: number | null;
  rightLine: number | null;
  left: string;
  right: string;
}

export interface TextDiffResult {
  rows: TextDiffRow[];
  stats: { unchanged: number; changed: number; added: number; removed: number };
}

type DiffOperation = {
  type: 'equal' | 'added' | 'removed';
  value: string;
  leftLine?: number;
  rightLine?: number;
};

function comparableLine(value: string, options: TextDiffOptions) {
  let result = value;
  if (options.ignoreWhitespace) result = result.replace(/\s+/gu, ' ').trim();
  if (options.ignoreCase) result = result.toLocaleLowerCase();
  return result;
}

function splitLines(value: string) {
  return String(value || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n');
}

export function compareTextLines(leftSource: string, rightSource: string, options: TextDiffOptions): TextDiffResult {
  if (leftSource.length + rightSource.length > 300_000) throw new ToolboxTextError('INPUT_TOO_LARGE');
  const left = splitLines(leftSource);
  const right = splitLines(rightSource);
  const cells = (left.length + 1) * (right.length + 1);
  if (cells > 2_000_000) throw new ToolboxTextError('DIFF_TOO_COMPLEX');

  const columns = right.length + 1;
  const matrix = new Uint32Array(cells);
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      const index = leftIndex * columns + rightIndex;
      matrix[index] =
        comparableLine(left[leftIndex]!, options) === comparableLine(right[rightIndex]!, options)
          ? matrix[(leftIndex + 1) * columns + rightIndex + 1]! + 1
          : Math.max(matrix[(leftIndex + 1) * columns + rightIndex]!, matrix[index + 1]!);
    }
  }

  const operations: DiffOperation[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (comparableLine(left[leftIndex]!, options) === comparableLine(right[rightIndex]!, options)) {
      operations.push({
        type: 'equal',
        value: left[leftIndex]!,
        leftLine: leftIndex + 1,
        rightLine: rightIndex + 1,
      });
      leftIndex += 1;
      rightIndex += 1;
    } else if (matrix[(leftIndex + 1) * columns + rightIndex]! >= matrix[leftIndex * columns + rightIndex + 1]!) {
      operations.push({ type: 'removed', value: left[leftIndex]!, leftLine: leftIndex + 1 });
      leftIndex += 1;
    } else {
      operations.push({ type: 'added', value: right[rightIndex]!, rightLine: rightIndex + 1 });
      rightIndex += 1;
    }
  }
  while (leftIndex < left.length) {
    operations.push({ type: 'removed', value: left[leftIndex]!, leftLine: leftIndex + 1 });
    leftIndex += 1;
  }
  while (rightIndex < right.length) {
    operations.push({ type: 'added', value: right[rightIndex]!, rightLine: rightIndex + 1 });
    rightIndex += 1;
  }

  const rows: TextDiffRow[] = [];
  let cursor = 0;
  let nextId = 1;
  while (cursor < operations.length) {
    const operation = operations[cursor]!;
    if (operation.type === 'equal') {
      rows.push({
        id: nextId++,
        kind: 'equal',
        leftLine: operation.leftLine ?? null,
        rightLine: operation.rightLine ?? null,
        left: operation.value,
        right: operation.value,
      });
      cursor += 1;
      continue;
    }
    const removed: DiffOperation[] = [];
    const added: DiffOperation[] = [];
    while (cursor < operations.length && operations[cursor]!.type !== 'equal') {
      const changed = operations[cursor]!;
      (changed.type === 'removed' ? removed : added).push(changed);
      cursor += 1;
    }
    for (let index = 0; index < Math.max(removed.length, added.length); index += 1) {
      const before = removed[index];
      const after = added[index];
      rows.push({
        id: nextId++,
        kind: before && after ? 'changed' : before ? 'removed' : 'added',
        leftLine: before?.leftLine ?? null,
        rightLine: after?.rightLine ?? null,
        left: before?.value ?? '',
        right: after?.value ?? '',
      });
    }
  }

  return {
    rows,
    stats: {
      unchanged: rows.filter((row) => row.kind === 'equal').length,
      changed: rows.filter((row) => row.kind === 'changed').length,
      added: rows.filter((row) => row.kind === 'added').length,
      removed: rows.filter((row) => row.kind === 'removed').length,
    },
  };
}

function normalizeTable(table: unknown[][]) {
  if (!table.length) throw new ToolboxTextError('INVALID_TABLE');
  if (table.length > 5_000) throw new ToolboxTextError('INPUT_TOO_LARGE');
  const columns = Math.max(...table.map((row) => row.length));
  if (!columns || columns > 200) throw new ToolboxTextError('INVALID_TABLE');
  return table.map((row) => Array.from({ length: columns }, (_, index) => String(row[index] ?? '')));
}

export function parseDelimitedTable(source: string, delimiter: ',' | '\t') {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const value = String(source || '').replace(/\r\n?/gu, '\n');
  if (value.length > 1_000_000) throw new ToolboxTextError('INPUT_TOO_LARGE');

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
      cell = '';
    } else if (character === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (quoted) throw new ToolboxTextError('INVALID_TABLE');
  row.push(cell);
  rows.push(row);
  if (rows.length > 1 && rows.at(-1)?.every((entry) => entry === '') && value.endsWith('\n')) rows.pop();
  return normalizeTable(rows);
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

function parseMarkdownTable(source: string) {
  const lines = String(source || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .filter((line) => line.trim());
  if (lines.length < 2) throw new ToolboxTextError('INVALID_TABLE');
  const rows = lines.map(splitMarkdownRow);
  const separator = rows[1];
  if (!separator?.length || !separator.every((cell) => /^:?-{3,}:?$/u.test(cell.trim()))) {
    throw new ToolboxTextError('INVALID_TABLE');
  }
  rows.splice(1, 1);
  return normalizeTable(rows);
}

function parseJsonTable(source: string) {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new ToolboxTextError('INVALID_JSON');
  }
  if (!Array.isArray(value) || !value.length) throw new ToolboxTextError('INVALID_JSON');
  if (value.every((entry) => Array.isArray(entry))) {
    const arrays = value as unknown[][];
    const columns = Math.max(...arrays.map((entry) => entry.length));
    return normalizeTable([Array.from({ length: columns }, (_, index) => `column_${index + 1}`), ...arrays]);
  }
  if (!value.every((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))) {
    throw new ToolboxTextError('INVALID_JSON');
  }
  const records = value as Record<string, unknown>[];
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  return normalizeTable([
    headers,
    ...records.map((record) =>
      headers.map((header) => {
        const cell = record[header];
        return cell != null && typeof cell === 'object' ? JSON.stringify(cell) : String(cell ?? '');
      }),
    ),
  ]);
}

export function parseTable(source: string, format: TableFormat) {
  if (String(source || '').length > 1_000_000) throw new ToolboxTextError('INPUT_TOO_LARGE');
  if (format === 'csv') return parseDelimitedTable(source, ',');
  if (format === 'tsv') return parseDelimitedTable(source, '\t');
  if (format === 'json') return parseJsonTable(source);
  return parseMarkdownTable(source);
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

export function serializeTable(table: string[][], format: TableFormat) {
  const normalized = normalizeTable(table);
  if (format === 'csv') return serializeDelimited(normalized, ',');
  if (format === 'tsv') return serializeDelimited(normalized, '\t');
  if (format === 'json') return serializeJson(normalized);
  return serializeMarkdown(normalized);
}

export function convertTable(source: string, inputFormat: TableFormat, outputFormat: TableFormat) {
  if (inputFormat === outputFormat) throw new ToolboxTextError('SAME_FORMAT');
  const table = parseTable(source, inputFormat);
  return {
    table,
    output: serializeTable(table, outputFormat),
    rows: Math.max(0, table.length - 1),
    columns: table[0]?.length || 0,
  };
}
