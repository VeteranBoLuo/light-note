import { parseTable, serializeTable, type TableFormat, ToolboxTextError } from '@/utils/toolboxTextTools';

export const TOOLBOX_DATASET_MAX_ROWS = 10_000;
export const TOOLBOX_DATASET_MAX_COLUMNS = 200;
export const TOOLBOX_DATASET_MAX_BYTES = 20 * 1024 * 1024;
export const TOOLBOX_DATASET_MAX_TOTAL_BYTES = 30 * 1024 * 1024;

export type DatasetFileFormat = TableFormat | 'xlsx';
export type DatasetValueType = 'empty' | 'number' | 'boolean' | 'date' | 'text' | 'mixed';
export type DatasetSeverity = 'high' | 'medium' | 'low';

export interface ToolboxDataset {
  name: string;
  headers: string[];
  rows: string[][];
}

export interface DatasetColumnProfile {
  name: string;
  type: DatasetValueType;
  missing: number;
  missingRate: number;
  unique: number;
  uniqueRate: number;
  min: number | null;
  max: number | null;
  average: number | null;
  samples: string[];
}

export interface DatasetQualityIssue {
  code: 'missing_values' | 'duplicate_rows' | 'empty_rows' | 'mixed_types' | 'empty_header';
  severity: DatasetSeverity;
  column?: string;
  count: number;
}

export interface DatasetQualityReport {
  score: number;
  rows: number;
  columns: number;
  cells: number;
  completeCells: number;
  duplicateRows: number;
  emptyRows: number;
  columnsProfile: DatasetColumnProfile[];
  issues: DatasetQualityIssue[];
}

export interface DatasetCleanOptions {
  trimCells: boolean;
  normalizeWhitespace: boolean;
  removeEmptyRows: boolean;
  removeDuplicateRows: boolean;
  normalizeHeaders: boolean;
}

export interface DatasetCleanResult {
  dataset: ToolboxDataset;
  changes: {
    trimmedCells: number;
    normalizedWhitespaceCells: number;
    removedEmptyRows: number;
    removedDuplicateRows: number;
    normalizedHeaders: number;
  };
}

export type DatasetValidationType = 'any' | 'text' | 'number' | 'date' | 'email' | 'url';

export interface DatasetValidationRule {
  column: string;
  required?: boolean;
  unique?: boolean;
  type?: DatasetValidationType;
  pattern?: string;
}

export interface DatasetValidationIssue {
  row: number;
  column: string;
  code: 'required' | 'duplicate' | 'type' | 'pattern';
  value: string;
}

export interface DatasetDiffResult {
  added: Array<Record<string, string>>;
  removed: Array<Record<string, string>>;
  changed: Array<{
    key: string;
    before: Record<string, string>;
    after: Record<string, string>;
    columns: string[];
  }>;
}

function makeUniqueHeaders(values: unknown[]) {
  const used = new Set<string>();
  return values.map((value, index) => {
    const base = String(value ?? '').trim() || `column_${index + 1}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

export function createToolboxDataset(table: unknown[][], name = 'dataset'): ToolboxDataset {
  if (!Array.isArray(table) || table.length === 0) throw new ToolboxTextError('INVALID_TABLE');
  const width = Math.max(...table.map((row) => (Array.isArray(row) ? row.length : 0)));
  if (!width || width > TOOLBOX_DATASET_MAX_COLUMNS) throw new ToolboxTextError('INVALID_TABLE');
  if (table.length - 1 > TOOLBOX_DATASET_MAX_ROWS) throw new ToolboxTextError('INPUT_TOO_LARGE');
  const headers = makeUniqueHeaders(table[0] || []);
  while (headers.length < width) headers.push(`column_${headers.length + 1}`);
  const rows = table.slice(1).map((row) =>
    Array.from({ length: width }, (_, index) => {
      const value = row?.[index];
      if (value == null) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    }),
  );
  return { name, headers, rows };
}

export function inferDatasetFileFormat(fileName: string): DatasetFileFormat | null {
  const extension = String(fileName || '')
    .toLowerCase()
    .split('.')
    .pop();
  if (extension === 'csv') return 'csv';
  if (extension === 'tsv' || extension === 'tab') return 'tsv';
  if (extension === 'json') return 'json';
  if (extension === 'md' || extension === 'markdown') return 'markdown';
  if (extension === 'xlsx') return 'xlsx';
  return null;
}

export function parseDatasetText(source: string, format: TableFormat, name = 'dataset') {
  return createToolboxDataset(parseTable(source, format), name);
}

export async function readToolboxDatasetFile(file: File): Promise<ToolboxDataset> {
  if (file.size > TOOLBOX_DATASET_MAX_BYTES) throw new ToolboxTextError('INPUT_TOO_LARGE');
  const format = inferDatasetFileFormat(file.name);
  if (!format) throw new ToolboxTextError('INVALID_TABLE');
  if (format !== 'xlsx') return parseDatasetText(await file.text(), format, file.name);

  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await file.arrayBuffer()) as ArrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount === 0) throw new ToolboxTextError('INVALID_TABLE');
  if (worksheet.rowCount - 1 > TOOLBOX_DATASET_MAX_ROWS || worksheet.columnCount > TOOLBOX_DATASET_MAX_COLUMNS) {
    throw new ToolboxTextError('INPUT_TOO_LARGE');
  }
  const table: string[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const values: string[] = [];
    for (let column = 1; column <= worksheet.columnCount; column += 1) values.push(row.getCell(column).text || '');
    table.push(values);
  });
  return createToolboxDataset(table, file.name);
}

function normalizeCellForType(value: string) {
  return String(value ?? '').trim();
}

function isValidDate(value: string) {
  if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T].*)?$/u.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

export function detectDatasetValueType(value: string): Exclude<DatasetValueType, 'mixed'> {
  const normalized = normalizeCellForType(value);
  if (!normalized) return 'empty';
  if (/^(?:true|false|yes|no|是|否)$/iu.test(normalized)) return 'boolean';
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(normalized)) return 'number';
  if (isValidDate(normalized)) return 'date';
  return 'text';
}

function round(value: number, digits = 4) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

export function profileToolboxDataset(dataset: ToolboxDataset): DatasetQualityReport {
  const rowCount = dataset.rows.length;
  const columnCount = dataset.headers.length;
  const cells = rowCount * columnCount;
  const rowKeys = new Set<string>();
  let duplicateRows = 0;
  let emptyRows = 0;
  for (const row of dataset.rows) {
    if (row.every((value) => !normalizeCellForType(value))) emptyRows += 1;
    const key = JSON.stringify(row);
    if (rowKeys.has(key)) duplicateRows += 1;
    else rowKeys.add(key);
  }

  const columnsProfile = dataset.headers.map((name, columnIndex): DatasetColumnProfile => {
    const values = dataset.rows.map((row) => normalizeCellForType(row[columnIndex] || ''));
    const present = values.filter(Boolean);
    const typeCounts = new Map<string, number>();
    for (const value of present) {
      const type = detectDatasetValueType(value);
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    }
    const types = [...typeCounts.keys()];
    const type: DatasetValueType =
      types.length === 0 ? 'empty' : types.length === 1 ? (types[0] as DatasetValueType) : 'mixed';
    const numeric = present.filter((value) => detectDatasetValueType(value) === 'number').map(Number);
    return {
      name,
      type,
      missing: rowCount - present.length,
      missingRate: rowCount ? round((rowCount - present.length) / rowCount) : 0,
      unique: new Set(present).size,
      uniqueRate: present.length ? round(new Set(present).size / present.length) : 0,
      min: numeric.length ? Math.min(...numeric) : null,
      max: numeric.length ? Math.max(...numeric) : null,
      average: numeric.length ? round(numeric.reduce((sum, value) => sum + value, 0) / numeric.length) : null,
      samples: [...new Set(present)].slice(0, 3),
    };
  });
  const missingCells = columnsProfile.reduce((sum, column) => sum + column.missing, 0);
  const issues: DatasetQualityIssue[] = [];
  for (const column of columnsProfile) {
    if (column.missing) {
      issues.push({
        code: 'missing_values',
        severity: column.missingRate >= 0.3 ? 'high' : column.missingRate >= 0.1 ? 'medium' : 'low',
        column: column.name,
        count: column.missing,
      });
    }
    if (column.type === 'mixed') {
      issues.push({ code: 'mixed_types', severity: 'medium', column: column.name, count: rowCount - column.missing });
    }
  }
  if (duplicateRows) issues.push({ code: 'duplicate_rows', severity: 'medium', count: duplicateRows });
  if (emptyRows) issues.push({ code: 'empty_rows', severity: 'low', count: emptyRows });
  const emptyHeaders = dataset.headers.filter((header) => !header.trim()).length;
  if (emptyHeaders) issues.push({ code: 'empty_header', severity: 'medium', count: emptyHeaders });

  const missingPenalty = cells ? (missingCells / cells) * 35 : 0;
  const duplicatePenalty = rowCount ? (duplicateRows / rowCount) * 25 : 0;
  const typePenalty = columnsProfile.filter((column) => column.type === 'mixed').length * 5;
  const emptyRowPenalty = rowCount ? (emptyRows / rowCount) * 15 : 0;
  return {
    score: Math.max(0, Math.round(100 - missingPenalty - duplicatePenalty - typePenalty - emptyRowPenalty)),
    rows: rowCount,
    columns: columnCount,
    cells,
    completeCells: cells - missingCells,
    duplicateRows,
    emptyRows,
    columnsProfile,
    issues,
  };
}

function normalizeHeader(value: string, index: number) {
  const normalized = value
    .trim()
    .replace(/\s+/gu, '_')
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
  return normalized || `column_${index + 1}`;
}

export function cleanToolboxDataset(dataset: ToolboxDataset, options: DatasetCleanOptions): DatasetCleanResult {
  const changes = {
    trimmedCells: 0,
    normalizedWhitespaceCells: 0,
    removedEmptyRows: 0,
    removedDuplicateRows: 0,
    normalizedHeaders: 0,
  };
  let headers = [...dataset.headers];
  if (options.normalizeHeaders) {
    const normalized = makeUniqueHeaders(headers.map(normalizeHeader));
    changes.normalizedHeaders = normalized.filter((value, index) => value !== headers[index]).length;
    headers = normalized;
  }
  let rows = dataset.rows.map((row) =>
    row.map((rawValue) => {
      let value = rawValue;
      if (options.trimCells) {
        const next = value.trim();
        if (next !== value) changes.trimmedCells += 1;
        value = next;
      }
      if (options.normalizeWhitespace) {
        const next = value.replace(/[\t \u00a0]+/gu, ' ');
        if (next !== value) changes.normalizedWhitespaceCells += 1;
        value = next;
      }
      return value;
    }),
  );
  if (options.removeEmptyRows) {
    const previous = rows.length;
    rows = rows.filter((row) => row.some((value) => value.trim()));
    changes.removedEmptyRows = previous - rows.length;
  }
  if (options.removeDuplicateRows) {
    const seen = new Set<string>();
    rows = rows.filter((row) => {
      const key = JSON.stringify(row);
      if (seen.has(key)) {
        changes.removedDuplicateRows += 1;
        return false;
      }
      seen.add(key);
      return true;
    });
  }
  return { dataset: { name: dataset.name, headers, rows }, changes };
}

function isTypeValid(value: string, type: DatasetValidationType) {
  if (type === 'any' || !value) return true;
  if (type === 'text') return true;
  if (type === 'number') return detectDatasetValueType(value) === 'number';
  if (type === 'date') return detectDatasetValueType(value) === 'date';
  if (type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
  if (type === 'url') {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }
  return true;
}

export function validateToolboxDataset(dataset: ToolboxDataset, rules: DatasetValidationRule[]) {
  const issues: DatasetValidationIssue[] = [];
  for (const rule of rules) {
    const columnIndex = dataset.headers.indexOf(rule.column);
    if (columnIndex < 0) continue;
    let pattern: RegExp | null = null;
    if (rule.pattern?.trim()) pattern = new RegExp(rule.pattern, 'u');
    const seen = new Set<string>();
    dataset.rows.forEach((row, rowIndex) => {
      const value = normalizeCellForType(row[columnIndex] || '');
      if (rule.required && !value) issues.push({ row: rowIndex + 2, column: rule.column, code: 'required', value });
      if (rule.unique && value) {
        if (seen.has(value)) issues.push({ row: rowIndex + 2, column: rule.column, code: 'duplicate', value });
        seen.add(value);
      }
      if (value && !isTypeValid(value, rule.type || 'any')) {
        issues.push({ row: rowIndex + 2, column: rule.column, code: 'type', value });
      }
      if (value && pattern && !pattern.test(value)) {
        issues.push({ row: rowIndex + 2, column: rule.column, code: 'pattern', value });
      }
    });
  }
  return issues;
}

export type DatasetAggregate = 'count' | 'sum' | 'average' | 'min' | 'max';

export function pivotToolboxDataset(
  dataset: ToolboxDataset,
  groupColumn: string,
  valueColumn: string | null,
  aggregate: DatasetAggregate,
) {
  const groupIndex = dataset.headers.indexOf(groupColumn);
  const valueIndex = valueColumn ? dataset.headers.indexOf(valueColumn) : -1;
  if (groupIndex < 0 || (aggregate !== 'count' && valueIndex < 0)) throw new ToolboxTextError('INVALID_TABLE');
  const buckets = new Map<string, number[]>();
  for (const row of dataset.rows) {
    const key = row[groupIndex] || '(empty)';
    const bucket = buckets.get(key) || [];
    if (aggregate === 'count') bucket.push(1);
    else {
      const value = Number(row[valueIndex]);
      if (Number.isFinite(value)) bucket.push(value);
    }
    buckets.set(key, bucket);
  }
  const valueHeader = aggregate === 'count' ? 'count' : `${aggregate}_${valueColumn}`;
  const rows = [...buckets.entries()]
    .map(([key, values]) => {
      let result = 0;
      if (values.length) {
        if (aggregate === 'count') result = values.length;
        else if (aggregate === 'sum') result = values.reduce((sum, value) => sum + value, 0);
        else if (aggregate === 'average') result = values.reduce((sum, value) => sum + value, 0) / values.length;
        else if (aggregate === 'min') result = Math.min(...values);
        else result = Math.max(...values);
      }
      return [key, String(round(result))];
    })
    .sort((left, right) => Number(right[1]) - Number(left[1]));
  return { name: `${dataset.name}-pivot`, headers: [groupColumn, valueHeader], rows } satisfies ToolboxDataset;
}

export function datasetToRecords(dataset: ToolboxDataset) {
  return dataset.rows.map(
    (row) =>
      Object.fromEntries(dataset.headers.map((header, index) => [header, row[index] || ''])) as Record<string, string>,
  );
}

export function diffToolboxDatasets(
  before: ToolboxDataset,
  after: ToolboxDataset,
  keyColumn: string,
): DatasetDiffResult {
  const beforeRows = datasetToRecords(before);
  const afterRows = datasetToRecords(after);
  const beforeMap = new Map(beforeRows.map((record) => [record[keyColumn] || '', record]));
  const afterMap = new Map(afterRows.map((record) => [record[keyColumn] || '', record]));
  const added: DatasetDiffResult['added'] = [];
  const removed: DatasetDiffResult['removed'] = [];
  const changed: DatasetDiffResult['changed'] = [];
  for (const [key, record] of afterMap) {
    const previous = beforeMap.get(key);
    if (!previous) added.push(record);
    else {
      const columns = [...new Set([...Object.keys(previous), ...Object.keys(record)])].filter(
        (column) => (previous[column] || '') !== (record[column] || ''),
      );
      if (columns.length) changed.push({ key, before: previous, after: record, columns });
    }
  }
  for (const [key, record] of beforeMap) if (!afterMap.has(key)) removed.push(record);
  return { added, removed, changed };
}

export type DatasetMergeMode = 'append' | 'left' | 'inner' | 'full';

function recordToRow(headers: string[], record: Record<string, string>) {
  return headers.map((header) => record[header] || '');
}

export function mergeToolboxDatasets(
  left: ToolboxDataset,
  right: ToolboxDataset,
  mode: DatasetMergeMode,
  keyColumn?: string,
): ToolboxDataset {
  const headers = [...new Set([...left.headers, ...right.headers])];
  if (mode === 'append') {
    return {
      name: `${left.name}-merged`,
      headers,
      rows: [...datasetToRecords(left), ...datasetToRecords(right)].map((record) => recordToRow(headers, record)),
    };
  }
  if (!keyColumn || !left.headers.includes(keyColumn) || !right.headers.includes(keyColumn)) {
    throw new ToolboxTextError('INVALID_TABLE');
  }
  const leftMap = new Map(datasetToRecords(left).map((record) => [record[keyColumn] || '', record]));
  const rightMap = new Map(datasetToRecords(right).map((record) => [record[keyColumn] || '', record]));
  const keys =
    mode === 'left'
      ? [...leftMap.keys()]
      : mode === 'inner'
        ? [...leftMap.keys()].filter((key) => rightMap.has(key))
        : [...new Set([...leftMap.keys(), ...rightMap.keys()])];
  return {
    name: `${left.name}-merged`,
    headers,
    rows: keys.map((key) => recordToRow(headers, { ...(leftMap.get(key) || {}), ...(rightMap.get(key) || {}) })),
  };
}

export function splitToolboxDataset(dataset: ToolboxDataset, column: string) {
  const columnIndex = dataset.headers.indexOf(column);
  if (columnIndex < 0) throw new ToolboxTextError('INVALID_TABLE');
  const groups = new Map<string, ToolboxDataset>();
  for (const row of dataset.rows) {
    const value = row[columnIndex]?.trim() || 'empty';
    const safeName = value.replace(/[\\/:*?"<>|]+/gu, '_').slice(0, 80) || 'empty';
    const group = groups.get(safeName) || {
      name: `${dataset.name}-${safeName}`,
      headers: [...dataset.headers],
      rows: [],
    };
    group.rows.push([...row]);
    groups.set(safeName, group);
  }
  return groups;
}

export type DatasetAnonymizeMode = 'mask' | 'pseudonym';

function pseudonym(value: string, column: string) {
  let hash = 2166136261;
  for (const character of `${column}:${value}`) {
    hash ^= character.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return `${column.slice(0, 3).toUpperCase() || 'VAL'}-${(hash >>> 0).toString(36).toUpperCase().padStart(7, '0')}`;
}

function maskValue(value: string) {
  if (value.length <= 2) return '*'.repeat(value.length);
  if (value.includes('@')) {
    const [name, domain] = value.split('@');
    return `${name?.slice(0, 1) || ''}${'*'.repeat(Math.max(2, (name?.length || 1) - 1))}@${domain || ''}`;
  }
  return `${value.slice(0, 1)}${'*'.repeat(Math.min(8, Math.max(2, value.length - 2)))}${value.slice(-1)}`;
}

export function anonymizeToolboxDataset(
  dataset: ToolboxDataset,
  columns: string[],
  mode: DatasetAnonymizeMode,
): ToolboxDataset {
  const indexes = columns.map((column) => dataset.headers.indexOf(column)).filter((index) => index >= 0);
  return {
    name: `${dataset.name}-anonymized`,
    headers: [...dataset.headers],
    rows: dataset.rows.map((row) =>
      row.map((value, index) => {
        if (!indexes.includes(index) || !value) return value;
        return mode === 'mask' ? maskValue(value) : pseudonym(value, dataset.headers[index] || 'value');
      }),
    ),
  };
}

export function serializeToolboxDataset(dataset: ToolboxDataset, format: TableFormat = 'csv') {
  return serializeTable([dataset.headers, ...dataset.rows], format);
}

export function toolboxDatasetPreviewRows(dataset: ToolboxDataset, limit = 50) {
  return dataset.rows.slice(0, limit).map((row, index) => ({
    __rowId: index + 1,
    ...Object.fromEntries(dataset.headers.map((header, columnIndex) => [header, row[columnIndex] || ''])),
  }));
}
