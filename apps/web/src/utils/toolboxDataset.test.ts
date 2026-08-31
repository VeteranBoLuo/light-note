import { describe, expect, it } from 'vitest';
import {
  anonymizeToolboxDataset,
  cleanToolboxDataset,
  createToolboxDataset,
  diffToolboxDatasets,
  mergeToolboxDatasets,
  pivotToolboxDataset,
  profileToolboxDataset,
  splitToolboxDataset,
  TOOLBOX_DATASET_MAX_TOTAL_BYTES,
  validateToolboxDataset,
} from './toolboxDataset';

const dataset = createToolboxDataset([
  [' 姓名 ', '部门', '金额', '邮箱'],
  [' Alice ', '研发', '10', 'alice@example.com'],
  ['Bob', '研发', '20', 'bad-email'],
  ['Bob', '研发', '20', 'bad-email'],
  ['', '', '', ''],
]);

describe('toolbox dataset', () => {
  it('keeps a shared 30 MB limit for two-file operations', () => {
    expect(TOOLBOX_DATASET_MAX_TOTAL_BYTES).toBe(30 * 1024 * 1024);
  });

  it('profiles missing values, duplicates and column types', () => {
    const report = profileToolboxDataset(dataset);
    expect(report.rows).toBe(4);
    expect(report.columns).toBe(4);
    expect(report.duplicateRows).toBe(1);
    expect(report.emptyRows).toBe(1);
    expect(report.columnsProfile.find((column) => column.name === '金额')?.type).toBe('number');
    expect(report.score).toBeLessThan(100);
  });

  it('cleans cells and rows without mutating the source', () => {
    const result = cleanToolboxDataset(dataset, {
      trimCells: true,
      normalizeWhitespace: true,
      removeEmptyRows: true,
      removeDuplicateRows: true,
      normalizeHeaders: true,
    });
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]?.[0]).toBe('Alice');
    expect(result.changes.removedDuplicateRows).toBe(1);
    expect(dataset.rows).toHaveLength(4);
  });

  it('validates required, unique, type and pattern rules', () => {
    const issues = validateToolboxDataset(dataset, [
      { column: '邮箱', required: true, unique: true, type: 'email' },
      { column: '金额', type: 'number', pattern: '^\\d+$' },
    ]);
    expect(issues.some((issue) => issue.code === 'duplicate')).toBe(true);
    expect(issues.filter((issue) => issue.code === 'type')).toHaveLength(2);
  });

  it('builds pivots and compares keyed tables', () => {
    const pivot = pivotToolboxDataset(dataset, '部门', '金额', 'sum');
    expect(pivot.rows.find((row) => row[0] === '研发')?.[1]).toBe('50');

    const before = createToolboxDataset([
      ['id', 'name', 'status'],
      ['1', 'A', 'open'],
      ['2', 'B', 'open'],
    ]);
    const after = createToolboxDataset([
      ['id', 'name', 'status'],
      ['1', 'A', 'closed'],
      ['3', 'C', 'open'],
    ]);
    const diff = diffToolboxDatasets(before, after, 'id');
    expect(diff.added).toHaveLength(1);
    expect(diff.removed).toHaveLength(1);
    expect(diff.changed[0]?.columns).toEqual(['status']);
  });

  it('merges and anonymizes datasets deterministically', () => {
    const left = createToolboxDataset([
      ['id', 'name'],
      ['1', 'Alice'],
    ]);
    const right = createToolboxDataset([
      ['id', 'team'],
      ['1', '研发'],
    ]);
    expect(mergeToolboxDatasets(left, right, 'inner', 'id').rows[0]).toEqual(['1', 'Alice', '研发']);
    const first = anonymizeToolboxDataset(left, ['name'], 'pseudonym');
    const second = anonymizeToolboxDataset(left, ['name'], 'pseudonym');
    expect(first.rows[0]?.[1]).toBe(second.rows[0]?.[1]);
    expect(first.rows[0]?.[1]).not.toBe('Alice');
  });

  it('splits one dataset into independently exportable groups', () => {
    const groups = splitToolboxDataset(dataset, '部门');
    expect(groups.get('研发')?.rows).toHaveLength(3);
    expect(groups.get('empty')?.rows).toHaveLength(1);
  });
});
