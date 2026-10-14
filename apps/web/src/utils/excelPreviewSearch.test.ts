import { describe, expect, it } from 'vitest';
import { findExcelPreviewCells, indexExcelPreview } from './excelPreviewSearch';

describe('Excel preview search', () => {
  const cells = indexExcelPreview([
    {
      name: '汇总',
      rows: {
        0: {
          cells: {
            0: { text: '预算 Alpha' },
            1: { text: '12.50%' },
            2: { text: 0 },
            3: { text: false },
            4: {},
            5: { text: '' },
          },
        },
        len: 100,
      },
    },
    { name: '明细', rows: { 98: { cells: { 26: { text: 'ALPHA [x]' } } } } },
  ]);
  it('搜索全部工作表的显示值，保留零和布尔值，忽略空单元格及长度元数据', () => {
    expect(cells).toHaveLength(5);
    expect(findExcelPreviewCells(cells, 'alpha').map(({ sheetName, address }) => [sheetName, address])).toEqual([
      ['汇总', 'A1'],
      ['明细', 'AA99'],
    ]);
    expect(findExcelPreviewCells(cells, '12.50%')).toHaveLength(1);
    expect(findExcelPreviewCells(cells, 'false')).toHaveLength(1);
    expect(findExcelPreviewCells(cells, '0').some((cell) => cell.address === 'C1')).toBe(true);
  });
  it('使用字面子串而非正则；空查询和无匹配返回空结果', () => {
    expect(findExcelPreviewCells(cells, '[x]')).toHaveLength(1);
    expect(findExcelPreviewCells(cells, '.*')).toEqual([]);
    expect(findExcelPreviewCells(cells, '  ')).toEqual([]);
  });
  it('横向和纵向合并单元格只计主格，跳过稀疏行后仍保持正确地址', () => {
    const merged = indexExcelPreview([
      {
        name: '合并',
        rows: {
          0: {
            cells: {
              0: { text: '目标', merge: [2, 1] },
              1: { text: '目标' },
              2: { text: '目标', merge: [0, 1] },
              3: { text: '目标' },
            },
          },
          2: { cells: { 0: { text: '目标' }, 1: { text: '目标' }, 2: { text: '目标' } } },
          3: { cells: { 0: { text: '目标' } } },
        },
      },
    ]);
    expect(findExcelPreviewCells(merged, '目标').map((cell) => cell.address)).toEqual(['A1', 'C1', 'C3', 'A4']);
  });
});
