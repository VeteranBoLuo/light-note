import { afterEach, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { exportExcelFile, readFirstExcelSheet } from './excel';

afterEach(() => vi.restoreAllMocks());
it('reads real XLSX values, preserving Chinese headers, tags and empty rows', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('bookmark');
  sheet.addRows([
    ['书签名', '网址', '描述', '标签'],
    ['中文 & <test>', 'https://example.test/?a=1&b=2', '说明', '工作 | 学习'],
    [],
    ['第二条', '', '', ''],
  ]);
  const buffer = await book.xlsx.writeBuffer();
  const file = { size: buffer.byteLength, arrayBuffer: async () => buffer } as File;
  const expected = [
    { 书签名: '中文 & <test>', 网址: 'https://example.test/?a=1&b=2', 描述: '说明', 标签: '工作 | 学习' },
    { 书签名: '第二条', 网址: '', 描述: '', 标签: '' },
  ];
  expect(await readFirstExcelSheet(file)).toEqual(expected);
  expect(await readFirstExcelSheet(file)).toEqual(expected);
});
it('rejects oversize files before reading them and enforces the row limit', async () => {
  const read = vi.fn();
  await expect(
    readFirstExcelSheet({ size: 5 * 1024 * 1024 + 1, arrayBuffer: read } as unknown as File),
  ).rejects.toThrow('5MB');
  expect(read).not.toHaveBeenCalled();
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('data');
  sheet.addRow(['name']);
  for (let i = 0; i < 1001; i++) sheet.addRow([`row-${i}`]);
  const buffer = await book.xlsx.writeBuffer();
  await expect(
    readFirstExcelSheet({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File),
  ).rejects.toThrow('1000');
});
it('exports a real workbook with unchanged columns, sheet name and download filename', async () => {
  const create = vi.fn(() => 'blob:test');
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('书签集合.xlsx');
  });
  await exportExcelFile(
    [{ title: '中文', tags: '甲 | 乙' }],
    [
      { header: '书签名', key: 'title', width: 12 },
      { header: '标签', key: 'tags', width: 20 },
    ],
    '书签集合.xlsx',
  );
  expect(click).toHaveBeenCalledOnce();
  const blob = create.mock.calls[0][0] as Blob;
  const buffer = await new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  expect(book.worksheets[0].name).toBe('bookmark');
  expect(book.worksheets[0].getRow(2).values).toEqual([undefined, '中文', '甲 | 乙']);
  vi.unstubAllGlobals();
});
it('accepts an empty sheet', async () => {
  const book = new ExcelJS.Workbook();
  book.addWorksheet('empty');
  const buffer = await book.xlsx.writeBuffer();
  expect(await readFirstExcelSheet({ size: buffer.byteLength, arrayBuffer: async () => buffer } as File)).toEqual([]);
});
