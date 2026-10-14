import { describe, expect, it } from 'vitest';
import {
  anonymizeToolboxDataset,
  cleanToolboxDataset,
  createToolboxDataset,
  diffToolboxDatasets,
  mergeToolboxDatasets,
  pivotToolboxDataset,
  profileToolboxDataset,
  prepareToolboxDatasetFile,
  readToolboxDatasetFile,
  parseDatasetText,
  serializeToolboxDataset,
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

  async function excelFile(sheets: Array<{ name: string; rows: string[][] }>) {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    for (const sheet of sheets) workbook.addWorksheet(sheet.name).addRows(sheet.rows);
    const bytes = await workbook.xlsx.writeBuffer();
    return { name: 'sample.xlsx', size: bytes.byteLength, arrayBuffer: async () => bytes } as File;
  }

  it('requires an explicit worksheet for multi-sheet Excel instead of analyzing the cover', async () => {
    const file = await excelFile([
      { name: '说明', rows: [['说明'], ['这不是业务数据']] },
      {
        name: '实际数据',
        rows: [
          ['id', 'amount'],
          ['A', '100'],
          ['B', '200'],
        ],
      },
    ]);
    const source = await prepareToolboxDatasetFile(file);
    expect(source.worksheets.map((sheet) => sheet.name)).toEqual(['说明', '实际数据']);
    expect(() => source.read()).toThrow('WORKSHEET_SELECTION_REQUIRED');
    expect(source.read(source.worksheets[1]!.id)).toMatchObject({
      worksheetName: '实际数据',
      headers: ['id', 'amount'],
      rows: [
        ['A', '100'],
        ['B', '200'],
      ],
    });
    expect(() => source.read(999)).toThrow('INVALID_TABLE');
  });

  it('allows selecting a later sheet when the first one is empty', async () => {
    const file = await excelFile([
      { name: '空白', rows: [] },
      { name: '数据', rows: [['id'], ['A']] },
    ]);
    const source = await prepareToolboxDatasetFile(file);
    expect(() => source.read(source.worksheets[0]!.id)).toThrow('INVALID_TABLE');
    expect(source.read(source.worksheets[1]!.id).rows).toEqual([['A']]);
  });

  it('loads single-sheet Excel directly and keeps its source visible after cleaning', async () => {
    const source = await readToolboxDatasetFile(await excelFile([{ name: '订单', rows: [['id'], [' A ']] }]));
    expect(
      cleanToolboxDataset(source, {
        trimCells: true,
        normalizeWhitespace: false,
        removeEmptyRows: false,
        removeDuplicateRows: false,
        normalizeHeaders: false,
      }).dataset,
    ).toMatchObject({ worksheetName: '订单', rows: [['A']] });
  });
});

it('decodes explicitly selected GBK and preserves a headerless first row', async () => {
  const bytes = Uint8Array.from([0xc3, 0xfb, 0xd7, 0xd6, 0x2c, 0x31, 0x0a, 0x41, 0x2c, 0x32]);
  const file = { name: 'sample.csv', size: bytes.length, arrayBuffer: async () => bytes.buffer } as File;
  await expect(prepareToolboxDatasetFile(file)).rejects.toThrow();
  const prepared = await prepareToolboxDatasetFile(file, { encoding: 'gb18030', firstRowHeader: false });
  expect(prepared.read()).toMatchObject({
    headers: ['column_1', 'column_2'],
    rows: [
      ['名字', '1'],
      ['A', '2'],
    ],
  });
});
it('rejects duplicate and empty match keys instead of silently dropping rows', () => {
  const right = createToolboxDataset([
    ['id', 'value'],
    ['1', 'new'],
  ]);
  for (const rows of [
    [
      ['1', 'a'],
      ['1', 'b'],
    ],
    [['', 'a']],
  ]) {
    const left = createToolboxDataset([['id', 'value'], ...rows]);
    expect(() => diffToolboxDatasets(left, right, 'id')).toThrow('toolbox.dataset.invalidKey');
    expect(() => mergeToolboxDatasets(left, right, 'left', 'id')).toThrow('toolbox.dataset.invalidKey');
    expect(mergeToolboxDatasets(left, right, 'append').rows).toHaveLength(rows.length + 1);
  }
});

it('imports and exports ten thousand records without inheriting the lightweight converter cap', () => {
  const source = 'id,value\n' + Array.from({ length: 10000 }, (_, i) => `${i},item-${i}`).join('\n');
  const data = parseDatasetText(source, 'csv');
  expect(data.rows).toHaveLength(10000);
  expect(serializeToolboxDataset(data, 'csv').split('\n')).toHaveLength(10001);
  expect(JSON.parse(serializeToolboxDataset(data, 'json'))).toHaveLength(10000);
  expect(() => parseDatasetText(source + '\n10001,extra', 'csv')).toThrow();
});
