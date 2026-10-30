import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { readFirstExcelSheet } from './excel';
import { parseBookmarkExcelRows } from './bookmarkExcelImport';

async function backupWorkbook(header: string[], row: unknown[]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('书签');
  sheet.addRow(header);
  sheet.addRow(row);
  // 备份里正文过长时另有「长正文」工作表，导入只读第一个工作表。
  book.addWorksheet('长正文').addRow(['书签编号', '字段', '段序', '内容']);
  const buffer = await book.xlsx.writeBuffer();
  return readFirstExcelSheet({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File);
}

describe('parseBookmarkExcelRows', () => {
  it('imports the data backup workbook, reading hyperlink cells as text and ignoring archive columns', async () => {
    const rows = await backupWorkbook(
      ['书签名', '网址', '描述', '网页正文', '标签', '收藏时间'],
      [
        '轻笺',
        { text: 'https://boluo66.top/', hyperlink: 'https://boluo66.top/' },
        '知识管理',
        { text: '很长的正文…（完整内容见长正文）', hyperlink: "#'长正文'!A2" },
        '工具 | 效率 | 工具',
        '2026-10-30T08:15:38.000Z',
      ],
    );
    expect(parseBookmarkExcelRows(rows)).toEqual([
      { name: '轻笺', url: 'https://boluo66.top/', description: '知识管理', tagNames: ['工具', '效率'] },
    ]);
  });

  it('accepts backups made before the header was unified', async () => {
    const rows = await backupWorkbook(
      ['标题', '网址', '描述', '网页正文', '标签', '收藏时间'],
      ['旧备份', 'https://example.com', '', '未保存正文', '工具, 效率', ''],
    );
    expect(parseBookmarkExcelRows(rows)).toEqual([
      { name: '旧备份', url: 'https://example.com', description: '', tagNames: ['工具', '效率'] },
    ]);
  });

  it('keeps commas inside tag names for the current format and rejects sheets without required columns', () => {
    expect(
      parseBookmarkExcelRows([{ 书签名: 'A', 网址: 'https://a.test', 描述: '', 标签: '读书, 笔记 | 工具' }])?.[0]
        .tagNames,
    ).toEqual(['读书, 笔记', '工具']);
    expect(parseBookmarkExcelRows([{ 名称: 'A', 网址: 'https://a.test', 描述: '' }])).toBeNull();
    expect(parseBookmarkExcelRows([])).toBeNull();
  });
});
