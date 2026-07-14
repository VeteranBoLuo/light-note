import ExcelJS from 'exceljs';

const { Workbook } = ExcelJS;

export interface ExcelColumn<T extends Record<string, unknown>> {
  header: string;
  key: keyof T & string;
  width?: number;
}

const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;

export async function exportExcelFile<T extends Record<string, unknown>>(
  rows: T[],
  columns: ExcelColumn<T>[],
  fileName: string,
  sheetName = 'bookmark',
) {
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.columns = columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));
  worksheet.addRows(rows);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function readFirstExcelSheet(file: File): Promise<Record<string, string>[]> {
  if (file.size > MAX_IMPORT_FILE_SIZE) {
    throw new Error('Excel 文件不能超过 5MB');
  }

  const workbook = new Workbook();
  await workbook.xlsx.load((await file.arrayBuffer()) as any);
  const worksheet = workbook.worksheets[0];
  if (!worksheet || worksheet.rowCount < 2) return [];

  const headers = worksheet.getRow(1).values as unknown[];
  const rows: Record<string, string>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1 || rows.length >= MAX_IMPORT_ROWS) return;
    const item: Record<string, string> = {};
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const header = String(headers[columnNumber] ?? '').trim();
      if (header) item[header] = cell.text.trim();
    });
    if (Object.values(item).some(Boolean)) rows.push(item);
  });

  if (worksheet.rowCount - 1 > MAX_IMPORT_ROWS) {
    throw new Error(`单次最多导入 ${MAX_IMPORT_ROWS} 条书签`);
  }
  return rows;
}
