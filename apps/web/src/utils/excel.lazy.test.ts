import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {
  vi.doUnmock('exceljs');
  vi.resetModules();
});
const file = { size: 1, arrayBuffer: async () => new ArrayBuffer(0) } as File;
const moduleValue = {
  default: {
    Workbook: class {
      worksheets = [];
      xlsx = { load: async () => {} };
    },
  },
};
it('does not load on import and shares the first concurrent request', async () => {
  let resolve!: (value: typeof moduleValue) => void;
  const factory = vi.fn(
    () =>
      new Promise<typeof moduleValue>((r) => {
        resolve = r;
      }),
  );
  vi.doMock('exceljs', factory);
  const { readFirstExcelSheet } = await import('./excel');
  expect(factory).not.toHaveBeenCalled();
  const a = readFirstExcelSheet(file),
    b = readFirstExcelSheet(file);
  await vi.waitFor(() => expect(factory).toHaveBeenCalledOnce());
  resolve(moduleValue);
  expect(await Promise.all([a, b])).toEqual([[], []]);
  await readFirstExcelSheet(file);
  expect(factory).toHaveBeenCalledOnce();
});
it('retries after a failed module load and rejects oversized input without loading', async () => {
  const factory = vi.fn(async () => {
    throw Error('offline');
  });
  vi.doMock('exceljs', factory);
  const { readFirstExcelSheet } = await import('./excel');
  await expect(readFirstExcelSheet({ ...file, size: 6 * 1024 * 1024 })).rejects.toThrow('5MB');
  expect(factory).not.toHaveBeenCalled();
  await expect(readFirstExcelSheet(file)).rejects.toBeInstanceOf(Error);
  vi.doMock('exceljs', () => moduleValue);
  expect(await readFirstExcelSheet(file)).toEqual([]);
});
