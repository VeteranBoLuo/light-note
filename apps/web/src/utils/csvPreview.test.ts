import { describe, expect, it } from 'vitest';
import { parseCsvPreview, MAX_CSV_PREVIEW_CHARS } from './csvPreview';

describe('CSV 表格预览数据', () => {
  it('保留中文、BOM、引号内逗号/换行、空值及不等长行', () => {
    expect(
      parseCsvPreview('\uFEFF名称,说明,编号\r\n"轻笺,工具","第一行\r\n第二行",00123\r\n"双""引号",,\r\n短行\r\n'),
    ).toEqual([
      ['名称', '说明', '编号'],
      ['轻笺,工具', '第一行\n第二行', '00123'],
      ['双"引号', '', ''],
      ['短行', '', ''],
    ]);
  });
  it('编号、大整数、日期及公式样文本都保持原文', () => {
    expect(parseCsvPreview('编号,大整数,日期,表达式\n0001,12345678901234567890,2026-10-13,=1+1')[1]).toEqual([
      '0001',
      '12345678901234567890',
      '2026-10-13',
      '=1+1',
    ]);
  });
  it('空文件可生成空白表格，破损引号和超限内容明确失败', () => {
    expect(parseCsvPreview('')).toEqual([['']]);
    expect(() => parseCsvPreview('a,"unclosed')).toThrowError(
      expect.objectContaining({ code: 'FILE_CONTENT_INVALID' }),
    );
    expect(() => parseCsvPreview('a'.repeat(MAX_CSV_PREVIEW_CHARS + 1))).toThrowError(
      expect.objectContaining({ code: 'FILE_SIZE_INVALID' }),
    );
    expect(() => parseCsvPreview(Array(501).fill(Array(200).fill('a').join(',')).join('\n'))).toThrowError(
      expect.objectContaining({ code: 'FILE_SIZE_INVALID' }),
    );
  });
});
