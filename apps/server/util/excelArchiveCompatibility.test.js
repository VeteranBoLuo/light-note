import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PassThrough, Readable } from 'node:stream';
import ExcelJS from 'exceljs';

const require = createRequire(import.meta.url);
const excelRequire = createRequire(require.resolve('exceljs/package.json'));
const StreamBuf = excelRequire('./lib/utils/stream-buf');
const iterateStream = excelRequire('./lib/utils/iterate-stream');
let directory;

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-excel-compat-'));
});
afterAll(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

function writeRows(sheet) {
  const header = sheet.addRow(['名称', '数量', '公式']);
  const row = sheet.addRow(['中文书签', 7, { formula: 'B2+1', result: 8 }]);
  row.getCell(1).font = { bold: true, color: { argb: 'FF123456' } };
  row.getCell(2).numFmt = '0.00';
  return { header, row };
}

function expectData(row) {
  expect(row.getCell(1).value).toBe('中文书签');
  expect(row.getCell(1).font).toMatchObject({ bold: true, color: { argb: 'FF123456' } });
  expect(row.getCell(2).value).toBe(7);
  expect(row.getCell(2).numFmt).toBe('0.00');
  expect(row.getCell(3).value).toEqual({ formula: 'B2+1', result: 8 });
}

describe('ExcelJS archive compatibility', () => {
  it('round-trips a real ordinary XLSX with Chinese text, formulas and styles', async () => {
    const original = new ExcelJS.Workbook();
    writeRows(original.addWorksheet('中文工作表'));
    const buffer = await original.xlsx.writeBuffer({ useSharedStrings: true });
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(buffer);
    expectData(restored.getWorksheet('中文工作表').getRow(2));
  });

  it('streams a real XLSX and reads shared strings, formulas and styles through both readers', async () => {
    const filename = path.join(directory, '流式书签.xlsx');
    const writer = new ExcelJS.stream.xlsx.WorkbookWriter({ filename, useStyles: true, useSharedStrings: true });
    const sheet = writer.addWorksheet('流式中文');
    const { header, row } = writeRows(sheet);
    header.commit();
    row.commit();
    sheet.commit();
    await writer.commit();

    const ordinary = new ExcelJS.Workbook();
    await ordinary.xlsx.readFile(filename);
    expectData(ordinary.getWorksheet('流式中文').getRow(2));

    const reader = new ExcelJS.stream.xlsx.WorkbookReader(filename, {
      entries: 'emit',
      sharedStrings: 'cache',
      styles: 'cache',
      hyperlinks: 'ignore',
      worksheets: 'emit',
    });
    let count = 0;
    for await (const worksheet of reader) {
      for await (const observed of worksheet) {
        if (observed.number !== 2) continue;
        expectData(observed);
        count += 1;
      }
    }
    expect(count).toBe(1);
    expect(reader.sharedStrings).toContain('中文书签');
  });

  it('returns the pipe destination and transfers buffered bytes to completion', async () => {
    const source = new StreamBuf();
    const destination = new PassThrough();
    expect(source.pipe(destination)).toBe(destination);
    source.end(Buffer.from('中文缓冲内容'));
    const chunks = [];
    for await (const chunk of destination) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString('utf8')).toBe('中文缓冲内容');
  });

  it('propagates stream errors through the asynchronous iterator', async () => {
    const failure = new Error('EXPECTED_EXCEL_STREAM_ERROR');
    const source = new Readable({
      read() {
        this.destroy(failure);
      },
    });
    await expect(iterateStream(source).next()).rejects.toBe(failure);
    expect(source.destroyed).toBe(true);
  });

  it('returns control without destroying the source so its owner can read the rest and close it', async () => {
    const source = Readable.from(['first', 'second', 'third'], { highWaterMark: 1 });
    try {
      const iterator = iterateStream(source);
      expect((await iterator.next()).value).toBe('first');
      await iterator.return();
      expect(source.destroyed).toBe(false);
      expect(source.readableFlowing).not.toBe(true);
      const remaining = [];
      for await (const item of iterateStream(source)) remaining.push(item);
      expect(remaining).toEqual(['second', 'third']);
    } finally {
      source.destroy();
    }
    expect(source.destroyed).toBe(true);
  });
});
