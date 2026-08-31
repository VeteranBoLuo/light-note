import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import {
  cloneProductionWorkbook,
  applyWorkbookCellStyle,
  deleteWorkbookColumns,
  insertWorkbookRows,
  isWorkbookFormulaSupported,
  recalculateWorkbookSheet,
  parseWorkbookFormulaBarValue,
  parseWorkbookCellAddress,
  workbookCellAddress,
  workbookCellDisplay,
  workbookColumnLabel,
  workbookFormulaBarValue,
  workbookSelectionRange,
  sortWorkbookRange,
  workbookUsedRange,
  WORKBOOK_FORMULA_ERRORS,
} from './productionWorkbookEditor';

describe('productionWorkbookEditor', () => {
  it('converts visible grid coordinates to A1 addresses', () => {
    expect(workbookColumnLabel(1)).toBe('A');
    expect(workbookColumnLabel(26)).toBe('Z');
    expect(workbookColumnLabel(27)).toBe('AA');
    expect(workbookCellAddress(12, 28)).toBe('AB12');
    expect(parseWorkbookCellAddress(' ab120 ')).toEqual({ row: 120, column: 28, address: 'AB120' });
    expect(workbookColumnLabel(16_384)).toBe('XFD');
    expect(workbookCellAddress(1_048_576, 16_384)).toBe('XFD1048576');
    expect(parseWorkbookCellAddress('XFD1048576')).toEqual({
      row: 1_048_576,
      column: 16_384,
      address: 'XFD1048576',
    });
    expect(parseWorkbookCellAddress('XFE1')).toBeNull();
    expect(parseWorkbookCellAddress('A1048577')).toBeNull();
    expect(parseWorkbookCellAddress('ZZZ999999')).toBeNull();
  });

  it('finds a sparse used range without expanding intermediate cells', () => {
    expect(
      workbookUsedRange({ id: 's1', name: 'Data', cells: { B2: { value: 1 }, AZ900: { value: 2 } }, extensions: {} }),
    ).toEqual({ maxRow: 900, maxColumn: 52 });
  });

  it('keeps formulas explicit and parses primitive values', () => {
    expect(parseWorkbookFormulaBarValue('=SUM(A1:A3)', { value: 6 })).toEqual({
      value: null,
      formula: 'SUM(A1:A3)',
    });
    expect(parseWorkbookFormulaBarValue('42')).toEqual({ value: 42 });
    expect(parseWorkbookFormulaBarValue('FALSE')).toEqual({ value: false });
    expect(parseWorkbookFormulaBarValue('  hello  ')).toEqual({ value: '  hello  ' });
    expect(parseWorkbookFormulaBarValue('   ')).toBeNull();
  });

  it('keeps imported formula caches when a complex or cross-sheet formula is resubmitted equivalently', () => {
    const complex = { value: 'positive', formula: 'IF(A1>0,"positive","negative")' };
    const crossSheet = { value: 60, formula: 'Budget!B2*3' };

    expect(parseWorkbookFormulaBarValue('  =IF(A1>0,"positive","negative")  ', complex)).toEqual(complex);
    expect(parseWorkbookFormulaBarValue('Budget!B2*3', crossSheet)).toEqual(crossSheet);
    expect(parseWorkbookFormulaBarValue('=Budget!B2*4', crossSheet)).toEqual({
      value: null,
      formula: 'Budget!B2*4',
    });
  });

  it('renders formulas without losing their last calculated value', () => {
    expect(workbookFormulaBarValue({ value: 3, formula: 'A1+A2' })).toBe('=A1+A2');
    expect(workbookCellDisplay({ value: 3, formula: 'A1+A2' })).toBe('3');
    expect(workbookCellDisplay({ value: null, formula: 'A1+A2' })).toBe('=A1+A2');
  });

  it('formats and styles an actual selected range without losing values', () => {
    const sheet = {
      id: 's1',
      name: 'Sheet 1',
      cells: { A1: { value: 1234.5 }, B2: { value: 0.12 } },
      extensions: {},
    };
    const range = workbookSelectionRange('B2', 'A1');
    expect(range).toEqual({ startRow: 1, endRow: 2, startColumn: 1, endColumn: 2 });
    applyWorkbookCellStyle(sheet, range, { bold: true, numberFormat: 'currency', align: 'right' });
    expect(sheet.cells.A1.style).toEqual({ bold: true, numberFormat: 'currency', align: 'right' });
    expect(sheet.cells.B2.value).toBe(0.12);
    expect(workbookCellDisplay(sheet.cells.A1)).toContain('1,234.50');
  });

  it('inserts and deletes real rows or columns while adjusting A1 formulas', () => {
    const sheet = {
      id: 's1',
      name: 'Sheet 1',
      cells: {
        A1: { value: 2 },
        A2: { value: 4 },
        B2: { value: 6, formula: 'A1+A2' },
      },
      extensions: {},
    };
    expect(insertWorkbookRows(sheet, 2)).toBe(true);
    expect(sheet.cells.A3).toEqual({ value: 4 });
    expect(sheet.cells.B3?.formula).toBe('A1+A3');
    expect(deleteWorkbookColumns(sheet, 1)).toBe(true);
    expect(sheet.cells.A3).toEqual(expect.objectContaining({ formula: expect.stringContaining('#REF!') }));
  });

  it('sorts every cell in a selected row range as one record', () => {
    const sheet = {
      id: 's1',
      name: 'Sheet 1',
      cells: {
        A1: { value: 'Charlie' },
        B1: { value: 3 },
        A2: { value: 'Alice' },
        B2: { value: 1 },
        A3: { value: 'Bob' },
        B3: { value: 2 },
      },
      extensions: {},
    };
    expect(sortWorkbookRange(sheet, workbookSelectionRange('A1', 'B3'), 2, 'ascending')).toBe(true);
    expect(sheet.cells.A1.value).toBe('Alice');
    expect(sheet.cells.B3.value).toBe(3);
  });

  it('clones a workbook without sharing sparse cells', () => {
    const source = {
      type: 'workbook' as const,
      schemaVersion: 1 as const,
      sheets: [{ id: 's1', name: 'Sheet 1', cells: { A1: { value: 'x' } }, extensions: {} }],
      activeSheetId: 's1',
      extensions: {},
    };
    const cloned = cloneProductionWorkbook(source);
    cloned.sheets[0].cells.A1.value = 'changed';
    expect(source.sheets[0].cells.A1.value).toBe('x');
  });

  it('clones a Vue reactive workbook for autosave snapshots', () => {
    const source = reactive({
      type: 'workbook' as const,
      schemaVersion: 1 as const,
      sheets: [{ id: 's1', name: 'Sheet 1', cells: { A1: { value: 'x' } }, extensions: {} }],
      activeSheetId: 's1',
      extensions: {},
    });
    const cloned = cloneProductionWorkbook(source);

    expect(cloned).toEqual(source);
    expect(cloned).not.toBe(source);
    expect(cloned.sheets[0]).not.toBe(source.sheets[0]);
  });

  it('recalculates references, arithmetic, parentheses and aggregate ranges without eval', () => {
    const sheet = {
      id: 's1',
      name: 'Sheet 1',
      cells: {
        A1: { value: 4 },
        A2: { value: 6 },
        A3: { value: 10 },
        B1: { value: null, formula: '(A1+A2)*2' },
        B2: { value: null, formula: 'SUM(A1:A3)' },
        B3: { value: null, formula: 'AVERAGE(A1:A3)' },
        B4: { value: null, formula: 'MIN(A1:A3)+MAX(A1:A3)+COUNT(A1:A3)' },
      },
      extensions: {},
    };
    expect(recalculateWorkbookSheet(sheet)).toEqual({ formulaCount: 4, errorCount: 0 });
    expect(sheet.cells.B1).toEqual({ value: 20, formula: '(A1+A2)*2' });
    expect(sheet.cells.B2.value).toBe(20);
    expect(sheet.cells.B3.value).toBeCloseTo(20 / 3);
    expect(sheet.cells.B4.value).toBe(17);
  });

  it('recalculates dependent formulas after a source cell changes', () => {
    const sheet = {
      id: 's1',
      name: 'Sheet 1',
      cells: {
        A1: { value: 2 },
        B1: { value: null, formula: 'A1*3' },
        C1: { value: null, formula: 'B1+1' },
      },
      extensions: {},
    };
    recalculateWorkbookSheet(sheet);
    expect(sheet.cells.C1.value).toBe(7);
    sheet.cells.A1.value = 5;
    expect(recalculateWorkbookSheet(sheet, ['A1'])).toEqual({ formulaCount: 2, errorCount: 0 });
    expect(sheet.cells.B1.value).toBe(15);
    expect(sheet.cells.C1.value).toBe(16);
  });

  it('preserves unsupported and cross-sheet formula caches during open and unrelated edits', () => {
    const sheet = {
      id: 's1',
      name: 'Sheet 1',
      cells: {
        A1: { value: 2 },
        B1: { value: 4, formula: 'A1*2' },
        C1: { value: 'positive', formula: 'IF(A1>0,"positive","negative")' },
        D1: { value: 99, formula: "'Other sheet'!A1" },
      },
      extensions: {},
    };
    expect(isWorkbookFormulaSupported('A1*2')).toBe(true);
    expect(isWorkbookFormulaSupported('IF(A1>0,"positive","negative")')).toBe(false);
    expect(isWorkbookFormulaSupported("'Other sheet'!A1")).toBe(false);

    expect(recalculateWorkbookSheet(sheet, ['Z1'])).toEqual({ formulaCount: 0, errorCount: 0 });
    expect(sheet.cells.C1).toEqual({ value: 'positive', formula: 'IF(A1>0,"positive","negative")' });
    expect(sheet.cells.D1).toEqual({ value: 99, formula: "'Other sheet'!A1" });

    sheet.cells.A1.value = 3;
    expect(recalculateWorkbookSheet(sheet, ['A1'])).toEqual({ formulaCount: 1, errorCount: 0 });
    expect(sheet.cells.B1).toEqual({ value: 6, formula: 'A1*2' });
    expect(sheet.cells.C1.value).toBe('positive');
    expect(sheet.cells.D1.value).toBe(99);
  });

  it('writes explicit cycle and divide-by-zero errors while preserving formulas', () => {
    const sheet = {
      id: 's1',
      name: 'Sheet 1',
      cells: {
        A1: { value: null, formula: 'B1+1' },
        B1: { value: null, formula: 'A1+1' },
        C1: { value: null, formula: '1/0' },
      },
      extensions: {},
    };
    expect(recalculateWorkbookSheet(sheet)).toEqual({ formulaCount: 3, errorCount: 3 });
    expect(sheet.cells.A1).toEqual({ value: WORKBOOK_FORMULA_ERRORS.cycle, formula: 'B1+1' });
    expect(sheet.cells.B1).toEqual({ value: WORKBOOK_FORMULA_ERRORS.cycle, formula: 'A1+1' });
    expect(sheet.cells.C1).toEqual({ value: WORKBOOK_FORMULA_ERRORS.divideByZero, formula: '1/0' });
  });
});
