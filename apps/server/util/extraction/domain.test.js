import { describe, it, expect } from 'vitest';
import { extractionCurrentValue, extractionRecordMatches, sortExtractionRecords } from '@lightnote/shared/extraction';
import { normalizePlan, planIdentity, reviewRecord, mergeBoundaryRecord, materialRefs } from './domain.js';
import { planWindows } from './material.js';
import { buildExtractionExport, safeCsvValue, extractionNoteSummary } from './export.js';
import ExcelJS from 'exceljs';
const plan = () =>
  normalizePlan({
    recordDefinition: '每个产品',
    fields: [{ key: 'name', label: '名称', type: 'text', rule: '原文名称' }],
  });
const row = () => ({
  id: 'r',
  sourceId: 's',
  version: 1,
  excluded: false,
  reviews: {},
  cells: [{ fieldId: 'f1', originalValue: '相机', status: 'found', evidence: [], evidenceIssues: [] }],
});
describe('提取工作台的原值与核对边界', () => {
  it('边界分歧仅标记变化字段，保留两份依据和人工值，再次相同提交不重复', () => {
    const original = row();
    original.cells.push({ ...original.cells[0], fieldId: 'f2', originalValue: '重量' });
    const incoming = {
      ...row(),
      cells: [
        { ...original.cells[0], originalValue: '另一相机', evidence: [{ quote: '另一相机', sourceId: 's' }] },
        original.cells[1],
      ],
    };
    const reviews = { f1: { overridden: true, value: '用户修正', checked: true }, f2: { checked: true } };
    const merged = mergeBoundaryRecord(original, incoming, reviews);
    expect(merged.payload.cells[0]).toMatchObject({
      originalValue: '相机',
      status: 'conflict',
      alternatives: [{ value: '另一相机', evidence: [{ quote: '另一相机' }] }],
    });
    expect(merged.payload.cells[1].status).toBe('found');
    expect(merged.reviews.f1).toMatchObject({ value: '用户修正', checked: false });
    expect(merged.reviews.f2.checked).toBe(true);
    expect(reviews.f1.checked).toBe(true);
    expect(mergeBoundaryRecord(merged.payload, incoming, merged.reviews)).toEqual(merged);
  });
  it('人工空字符串可恢复，陈旧提交不覆盖当前记录', () => {
    const original = row(),
      edited = reviewRecord(original, { version: 1, action: 'review', fieldId: 'f1', value: '', checked: true });
    expect(extractionCurrentValue(edited.cells[0], edited.reviews.f1)).toBe('');
    expect(original.cells[0].originalValue).toBe('相机');
    expect(original.reviews).toEqual({});
    expect(() => reviewRecord(edited, { version: 1, action: 'restore', fieldId: 'f1' })).toThrow('数据已变化');
    const restored = reviewRecord(edited, { version: 2, action: 'restore', fieldId: 'f1' });
    expect(extractionCurrentValue(restored.cells[0], restored.reviews.f1)).toBe('相机');
    expect(restored.reviews.f1.checked).toBe(false);
  });
  it('显示名变化复用样例；规则、类型与顺序改变使样例失效', () => {
    const p = plan(),
      renamed = { ...p, fields: p.fields.map((f) => ({ ...f, label: '产品' })) };
    expect(planIdentity(renamed)).toBe(planIdentity(p));
    expect(planIdentity({ ...p, fields: p.fields.map((f) => ({ ...f, type: 'number' })) })).not.toBe(planIdentity(p));
    expect(() =>
      normalizePlan({ ...p, fields: [p.fields[0], { ...p.fields[0], key: 'other', label: ' 名 称 ' }] }),
    ).toThrow('重复');
  });
  it('显式选择去重，待核对与异常筛选尊重当前修正', () => {
    expect(() =>
      materialRefs([
        { id: 'n', type: 'note' },
        { id: 'n', type: 'note' },
      ]),
    ).toThrow('重复');
    expect(() => materialRefs({ allMatching: true })).toThrow();
    const r = row();
    expect(extractionRecordMatches(r, { search: '相机', review: 'pending' })).toBe(true);
    const edited = reviewRecord(r, { version: 1, action: 'review', fieldId: 'f1', value: '产品', checked: true });
    expect(extractionRecordMatches(edited, { search: '相机' })).toBe(false);
    expect(extractionRecordMatches(edited, { review: 'pending' })).toBe(false);
  });
});
describe('完整范围、分段与导出', () => {
  it('所有段落都有处理窗口，边界重叠使用稳定身份且不割断横表', () => {
    const source = {
      id: 's',
      version: 'v1',
      complete: true,
      segments: Array.from({ length: 15 }, (_, i) => ({
        id: `s${i}`,
        text: '产品' + i + '\n| 参数 | A | B |\n|重量|3 g|4 g|\n' + '.'.repeat(70),
        kind: 'original',
        locator: '段落',
      })),
    };
    const windows = planWindows(source, 700);
    expect(windows.length).toBeGreaterThan(1);
    expect(new Set(windows.flatMap((w) => w.segments.map((s) => s.id))).size).toBe(15);
    for (let i = 1; i < windows.length; i++) expect(windows[i].segments[0]).toEqual(windows[i - 1].segments.at(-1));
    expect(() =>
      planWindows({ ...source, segments: [{ ...source.segments[0], text: '字'.repeat(5000) }] }, 700),
    ).toThrow('单个段落');
  });
  it('超过一页仍导出完整快照，CSV 防公式且 Excel 保留原值与核对', async () => {
    const snapshot = {
      table: { title: '提取', plan: plan(), dataVersion: 7, status: 'completed' },
      sources: [{ id: 's', title: '原文', version: 'v1', coverage: { complete: false } }],
      records: Array.from({ length: 120 }, (_, i) => ({ ...row(), id: `r${i}` })),
    };
    snapshot.records[0] = reviewRecord(snapshot.records[0], {
      version: 1,
      action: 'review',
      fieldId: 'f1',
      value: '=SUM(1,1)',
      checked: true,
    });
    const csv = await buildExtractionExport(snapshot, 'csv');
    expect(csv.data.split('\r\n')).toHaveLength(121);
    expect(csv.data).toContain("'=SUM(1,1)");
    expect(safeCsvValue('\t@danger')).toContain("'\t@danger");
    const xlsx = await buildExtractionExport(snapshot, 'xlsx'),
      book = new ExcelJS.Workbook();
    await book.xlsx.load(xlsx.data);
    expect(book.worksheets.map((s) => s.name)).toEqual(['数据', '依据与核对', '处理说明']);
    expect(book.worksheets[0].rowCount).toBe(121);
    expect(book.worksheets[1].getCell('C2').value).toBe('相机');
    expect(book.worksheets[1].getCell('D2').value).toBe('=SUM(1,1)');
  });
  it('数值与日期排序不猜单位；摘要 Markdown 是完整表格，收据稳定', async () => {
    const fields = [{ id: 'f1', type: 'number' }];
    const records = ['10', '2', '7 kg', '', 'bad'].map((value, i) => ({
      ...row(),
      id: String(i),
      cells: [{ ...row().cells[0], originalValue: value }],
    }));
    expect(sortExtractionRecords(records, fields, { sortField: 'f1' }).map((r) => r.cells[0].originalValue)).toEqual([
      '2',
      '10',
      '7 kg',
      '',
      'bad',
    ]);
    expect(sortExtractionRecords(records, [{ id: 'f1', type: 'date' }], { sortField: 'f1' })).toHaveLength(5);
    const snapshot = {
      table: { id: 'table', title: '产品', plan: plan(), dataVersion: 2 },
      sources: [],
      records: [row()],
    };
    const note = extractionNoteSummary(snapshot);
    const { marked } = await import('marked');
    expect(marked.parse(note.content)).toContain('<table>');
    expect(extractionNoteSummary(snapshot).snapshotId).toBe(note.snapshotId);
  });
});
