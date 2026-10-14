/** The renderer's transformed display values, including formatted numbers and formula results. */
export interface ExcelPreviewSheet {
  name: string;
  rows: Record<string, { cells?: Record<string, { text?: unknown; merge?: [number, number] }> } | number>;
}

export interface ExcelPreviewCell {
  sheet: number;
  sheetName: string;
  row: number;
  column: number;
  address: string;
  text: string;
  normalized: string;
}

export function indexExcelPreview(sheets: ExcelPreviewSheet[]): ExcelPreviewCell[] {
  const cells: ExcelPreviewCell[] = [];
  sheets.forEach((sheet, sheetIndex) => {
    let merges: Array<{ row: number; column: number; endRow: number; endColumn: number }> = [];
    for (const [rowKey, row] of Object.entries(sheet.rows)) {
      if (!/^\d+$/.test(rowKey) || typeof row !== 'object' || !row?.cells) continue;
      const rowIndex = Number(rowKey);
      merges = merges.filter((merge) => merge.endRow >= rowIndex);
      for (const [columnKey, cell] of Object.entries(row.cells)) {
        if (!/^\d+$/.test(columnKey) || !cell) continue;
        const column = Number(columnKey);
        // The renderer repeats a merged value in its covered cells. Index only the top-left master.
        merges = merges.filter((merge) => merge.endRow > rowIndex || merge.endColumn >= column);
        if (merges.some((merge) => column >= merge.column && column <= merge.endColumn)) continue;
        if (cell.merge)
          merges.push({ row: rowIndex, column, endRow: rowIndex + cell.merge[0], endColumn: column + cell.merge[1] });
        if (cell.text == null) continue;
        const text = String(cell.text);
        if (!text) continue;
        let address = '';
        for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) {
          address = String.fromCharCode(65 + ((n - 1) % 26)) + address;
        }
        cells.push({
          sheet: sheetIndex,
          sheetName: sheet.name,
          row: rowIndex,
          column,
          address: `${address}${rowIndex + 1}`,
          text,
          normalized: text.toLocaleLowerCase(),
        });
      }
    }
  });
  return cells;
}

export function findExcelPreviewCells(cells: ExcelPreviewCell[], query: string): ExcelPreviewCell[] {
  const needle = query.toLocaleLowerCase();
  return needle.trim() ? cells.filter((cell) => cell.normalized.includes(needle)) : [];
}
