import type {
  ProductionWorkbookContentV1,
  ProductionWorkbookSheetV1,
} from '@lightnote/shared/production-project-protocol';
import { productionProjectFileName, type ProductionProjectExportFile } from '@/utils/productionProjectExportHelpers';
import { parseWorkbookCellAddress, workbookCellAddress } from '@/utils/productionWorkbookEditor';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FORMULA_PREFIX_PATTERN = /^[=+\-@]/u;
const XLSX_NUMBER_FORMATS = Object.freeze({
  general: 'General',
  number: '#,##0.00',
  currency: '¥#,##0.00',
  percent: '0.00%',
  date: 'yyyy-mm-dd',
});
export const PRODUCTION_WORKBOOK_CSV_MAX_DENSE_CELLS = 500_000;

export class ProductionWorkbookExportError extends Error {
  readonly code: 'WORKBOOK_CSV_RANGE_TOO_LARGE';

  constructor(code: 'WORKBOOK_CSV_RANGE_TOO_LARGE') {
    super(code);
    this.name = 'ProductionWorkbookExportError';
    this.code = code;
  }
}

function assertWorkbookSnapshot(content: ProductionWorkbookContentV1) {
  if (content?.type !== 'workbook' || content.schemaVersion !== 1) {
    throw new Error('Unsupported production workbook snapshot');
  }
  return content;
}

function addressPosition(address: string) {
  const parsed = parseWorkbookCellAddress(address);
  if (!parsed) throw new Error(`Invalid workbook cell address: ${address}`);
  return parsed;
}

function safeWorksheetName(value: string, used: Set<string>) {
  const base =
    String(value || 'Sheet')
      .replace(/[\\/*?:\[\]]/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
      .slice(0, 31) || 'Sheet';
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate.toLocaleLowerCase())) {
    const marker = ` (${suffix})`;
    candidate = `${base.slice(0, Math.max(1, 31 - marker.length))}${marker}`;
    suffix += 1;
  }
  used.add(candidate.toLocaleLowerCase());
  return candidate;
}

function activeSheet(content: ProductionWorkbookContentV1) {
  if (!content.sheets.length) return null;
  return content.sheets.find((sheet) => sheet.id === content.activeSheetId) || content.sheets[0];
}

function csvCellValue(cell: ProductionWorkbookSheetV1['cells'][string]) {
  if (cell.formula) return cell.formula.startsWith('=') ? cell.formula : `=${cell.formula}`;
  if (cell.value === null) return '';
  if (typeof cell.value === 'boolean') return cell.value ? 'TRUE' : 'FALSE';
  const text = String(cell.value);
  return typeof cell.value === 'string' && FORMULA_PREFIX_PATTERN.test(text) ? `'${text}` : text;
}

function quoteCsv(value: string) {
  return /[",\r\n]/u.test(value) ? `"${value.replace(/"/gu, '""')}"` : value;
}

export function buildProductionWorkbookCsv(content: ProductionWorkbookContentV1) {
  const snapshot = assertWorkbookSnapshot(content);
  const sheet = activeSheet(snapshot);
  if (!sheet || !Object.keys(sheet.cells).length) return '';
  let maxRow = 0;
  let maxColumn = 0;
  const positioned = new Map<string, ProductionWorkbookSheetV1['cells'][string]>();
  for (const [address, cell] of Object.entries(sheet.cells)) {
    const position = addressPosition(address);
    maxRow = Math.max(maxRow, position.row);
    maxColumn = Math.max(maxColumn, position.column);
    positioned.set(`${position.row}:${position.column}`, cell);
  }
  if (maxColumn && maxRow > Math.floor(PRODUCTION_WORKBOOK_CSV_MAX_DENSE_CELLS / maxColumn)) {
    throw new ProductionWorkbookExportError('WORKBOOK_CSV_RANGE_TOO_LARGE');
  }
  const rows: string[] = [];
  for (let row = 1; row <= maxRow; row += 1) {
    const values: string[] = [];
    for (let column = 1; column <= maxColumn; column += 1) {
      const cell = positioned.get(`${row}:${column}`);
      values.push(quoteCsv(cell ? csvCellValue(cell) : ''));
    }
    rows.push(values.join(','));
  }
  return rows.join('\r\n');
}

export function exportProductionWorkbookCsv(
  content: ProductionWorkbookContentV1,
  title: string,
): ProductionProjectExportFile {
  const csv = buildProductionWorkbookCsv(content);
  return {
    fileName: productionProjectFileName(title, 'untitled-workbook', 'csv'),
    mimeType: 'text/csv;charset=utf-8',
    blob: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
  };
}

export async function exportProductionWorkbookXlsx(
  content: ProductionWorkbookContentV1,
  title: string,
): Promise<ProductionProjectExportFile> {
  const snapshot = assertWorkbookSnapshot(content);
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const fixedDate = new Date('2000-01-01T00:00:00.000Z');
  workbook.creator = 'Light Note';
  workbook.lastModifiedBy = 'Light Note';
  workbook.created = fixedDate;
  workbook.modified = fixedDate;
  workbook.lastPrinted = fixedDate;
  workbook.title = String(title || '').trim() || 'Untitled workbook';
  workbook.calcProperties.fullCalcOnLoad = true;
  const usedNames = new Set<string>();
  const sheets = snapshot.sheets.length
    ? snapshot.sheets
    : [{ id: 'sheet-1', name: 'Sheet1', cells: {}, extensions: {} }];
  sheets.forEach((sheet) => {
    const worksheet = workbook.addWorksheet(safeWorksheetName(sheet.name, usedNames));
    for (const [address, sourceCell] of Object.entries(sheet.cells)) {
      addressPosition(address);
      const cell = worksheet.getCell(address);
      if (sourceCell.formula) {
        const formula = sourceCell.formula.replace(/^=/u, '');
        cell.value = sourceCell.value === null ? { formula } : { formula, result: sourceCell.value };
      } else {
        cell.value = sourceCell.value;
      }
      if (sourceCell.style) {
        cell.font = {
          ...(sourceCell.style.bold !== undefined ? { bold: sourceCell.style.bold } : {}),
          ...(sourceCell.style.italic !== undefined ? { italic: sourceCell.style.italic } : {}),
          ...(sourceCell.style.underline !== undefined ? { underline: sourceCell.style.underline } : {}),
          ...(sourceCell.style.textColor
            ? { color: { argb: `FF${sourceCell.style.textColor.slice(1).toUpperCase()}` } }
            : {}),
        };
        if (sourceCell.style.fillColor) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: `FF${sourceCell.style.fillColor.slice(1).toUpperCase()}` },
          };
        }
        cell.alignment = {
          ...(sourceCell.style.align ? { horizontal: sourceCell.style.align } : {}),
          ...(sourceCell.style.wrapText !== undefined ? { wrapText: sourceCell.style.wrapText } : {}),
          vertical: 'middle',
        };
        if (sourceCell.style.numberFormat) {
          cell.numFmt = XLSX_NUMBER_FORMATS[sourceCell.style.numberFormat];
        }
      }
    }
    if (sheet.view && (sheet.view.freezeRows || sheet.view.freezeColumns)) {
      worksheet.views = [
        {
          state: 'frozen',
          xSplit: sheet.view.freezeColumns,
          ySplit: sheet.view.freezeRows,
          topLeftCell: workbookCellAddress(sheet.view.freezeRows + 1, sheet.view.freezeColumns + 1),
        },
      ];
    }
  });
  const activeIndex = Math.max(
    0,
    sheets.findIndex((sheet) => sheet.id === snapshot.activeSheetId),
  );
  workbook.views = [
    {
      x: 0,
      y: 0,
      width: 12_000,
      height: 8_000,
      activeTab: activeIndex,
      firstSheet: activeIndex,
      visibility: 'visible',
    },
  ];
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    fileName: productionProjectFileName(title, 'untitled-workbook', 'xlsx'),
    mimeType: XLSX_MIME,
    blob: new Blob([buffer as BlobPart], { type: XLSX_MIME }),
  };
}
