import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { ProductionWorkbookContentV1 } from '@lightnote/shared/production-project-protocol';
import {
  PRODUCTION_WORKBOOK_CSV_MAX_DENSE_CELLS,
  ProductionWorkbookExportError,
  buildProductionWorkbookCsv,
  exportProductionWorkbookCsv,
  exportProductionWorkbookXlsx,
} from './productionProjectWorkbookExport';

function workbookSnapshot(): ProductionWorkbookContentV1 {
  return {
    type: 'workbook',
    schemaVersion: 1,
    sheets: [
      {
        id: 'sheet-1',
        name: 'Budget',
        cells: {
          A1: { value: 'Name' },
          B1: { value: 'Amount' },
          A2: { value: 'Hosting, "Pro"' },
          B2: {
            value: 18,
            style: {
              bold: true,
              textColor: '#ffffff',
              fillColor: '#615ced',
              align: 'right',
              numberFormat: 'currency',
            },
          },
          A3: { value: '=UNTRUSTED()' },
          B3: { value: 36, formula: '=SUM(B2*2)' },
        },
        view: { freezeRows: 1, freezeColumns: 1 },
        extensions: {},
      },
    ],
    activeSheetId: 'sheet-1',
    extensions: {},
  };
}

describe('production project workbook export', () => {
  it('serializes the active sheet CSV with quotes, explicit formulas and formula-injection protection', async () => {
    const csv = buildProductionWorkbookCsv(workbookSnapshot());
    expect(csv).toBe('Name,Amount\r\n"Hosting, ""Pro""",18\r\n\'=UNTRUSTED(),=SUM(B2*2)');
    const exported = exportProductionWorkbookCsv(workbookSnapshot(), 'Budget/2026');
    expect(exported.fileName).toBe('Budget 2026.csv');
    expect(await exported.blob.text()).toBe(csv);
  });

  it('creates a real XLSX package and preserves explicit formulas only', async () => {
    const exported = await exportProductionWorkbookXlsx(workbookSnapshot(), 'Budget');
    const zip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']),
    );
    expect(await zip.file('[Content_Types].xml')!.async('string')).toContain('spreadsheetml.sheet.main+xml');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await exported.blob.arrayBuffer());
    const sheet = workbook.getWorksheet('Budget')!;
    expect(sheet.getCell('A3').value).toBe('=UNTRUSTED()');
    expect(sheet.getCell('B3').value).toMatchObject({ formula: 'SUM(B2*2)', result: 36 });
    expect(sheet.getCell('B2').font.bold).toBe(true);
    expect(sheet.getCell('B2').fill).toMatchObject({ pattern: 'solid' });
    expect(sheet.getCell('B2').numFmt).toBe('¥#,##0.00');
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: 1 });
  });

  it('handles empty workbook content deterministically', async () => {
    const empty: ProductionWorkbookContentV1 = {
      type: 'workbook',
      schemaVersion: 1,
      sheets: [],
      activeSheetId: null,
      extensions: {},
    };
    expect(buildProductionWorkbookCsv(empty)).toBe('');
    const csv = exportProductionWorkbookCsv(empty, '');
    expect(await csv.blob.text()).toBe('');
    const xlsx = await exportProductionWorkbookXlsx(empty, '');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await xlsx.blob.arrayBuffer());
    expect(workbook.worksheets).toHaveLength(1);
    expect(workbook.worksheets[0].name).toBe('Sheet1');
  });

  it('fails fast when sparse cells would require an excessive dense CSV range', () => {
    const sparse: ProductionWorkbookContentV1 = {
      type: 'workbook',
      schemaVersion: 1,
      sheets: [
        {
          id: 'sheet-1',
          name: 'Sparse',
          cells: { XFD1048576: { value: 'last Excel cell' } },
          extensions: {},
        },
      ],
      activeSheetId: 'sheet-1',
      extensions: {},
    };
    expect(PRODUCTION_WORKBOOK_CSV_MAX_DENSE_CELLS).toBe(500_000);
    expect(() => buildProductionWorkbookCsv(sparse)).toThrowError(ProductionWorkbookExportError);
    expect(() => buildProductionWorkbookCsv(sparse)).toThrowError('WORKBOOK_CSV_RANGE_TOO_LARGE');
  });

  it('exports the real final Excel cell without extending beyond XFD1048576', async () => {
    const boundary: ProductionWorkbookContentV1 = {
      type: 'workbook',
      schemaVersion: 1,
      sheets: [
        {
          id: 'sheet-1',
          name: 'Boundary',
          cells: { XFD1048576: { value: 7 } },
          extensions: {},
        },
      ],
      activeSheetId: 'sheet-1',
      extensions: {},
    };
    const exported = await exportProductionWorkbookXlsx(boundary, 'Boundary');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await exported.blob.arrayBuffer());
    expect(workbook.getWorksheet('Boundary')!.getCell('XFD1048576').value).toBe(7);
  });
});
