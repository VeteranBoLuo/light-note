import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import {
  normalizeProductionProjectContent,
  validateProductionProjectContent,
  type ProductionWorkbookContentV1,
} from '@lightnote/shared/production-project-protocol';
import {
  createProductionPresentationFromOutline,
  importProductionDocumentFile,
  importProductionWorkbookFile,
  inferProductionProjectImportKind,
  isProductionPresentationOutlineSlideLimitError,
  productionImportTitle,
} from './productionProjectImports';
import { exportProductionWorkbookXlsx } from './productionProjectWorkbookExport';
import {
  cloneProductionWorkbook,
  parseWorkbookFormulaBarValue,
  recalculateWorkbookSheet,
} from './productionWorkbookEditor';

vi.mock('@/utils/toolboxDocumentText', () => ({
  convertDocxToMarkdown: vi.fn(async () => ({
    markdown: '# Imported DOCX\n\nConverted locally',
    stats: { images: 1 },
  })),
}));

describe('productionProjectImports', () => {
  it('infers the supported production import surfaces without pretending PPTX is editable', () => {
    expect(inferProductionProjectImportKind('draft.md')).toBe('document');
    expect(inferProductionProjectImportKind('data.xlsx')).toBe('workbook');
    expect(inferProductionProjectImportKind('deck.pptx')).toBeNull();
    expect(productionImportTitle('Quarterly.review.md')).toBe('Quarterly.review');
  });

  it('turns Markdown into an independent document project payload', async () => {
    const result = await importProductionDocumentFile(new File(['# Imported\n\nBody'], 'report.md'));
    expect(result.title).toBe('report');
    expect(result.content.body.value).toContain('# Imported');
    expect(validateProductionProjectContent(result.content, 'document')).toBe(true);
  });

  it('converts DOCX locally and reports unsupported embedded images', async () => {
    const result = await importProductionDocumentFile(
      new File(['local-docx'], 'brief.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );
    expect(result.title).toBe('brief');
    expect(result.content.body.value).toContain('Imported DOCX');
    expect(result.warnings).toContain('DOCX_IMAGES_NOT_EMBEDDED');
    expect(validateProductionProjectContent(result.content, 'document')).toBe(true);
  });

  it('turns a Markdown outline into title and content slides', () => {
    const content = createProductionPresentationFromOutline(
      '# Product launch\n\nA focused story\n\n## Problem\n\n- Evidence\n\n## Plan\n\n1. Ship',
    );
    expect(content.slides.map((slide) => slide.title)).toEqual(['Product launch', 'Problem', 'Plan']);
    expect(content.slides[1]?.body.value).toContain('Evidence');
    expect(validateProductionProjectContent(content, 'presentation')).toBe(true);
  });

  it('keeps every slide at the 500-slide limit instead of slicing the tail', () => {
    const finalTitle = 'Final accepted slide';
    const sections = [
      ...Array.from({ length: 498 }, (_, index) => `## Slide ${index + 1}\n\nBody ${index + 1}`),
      `## ${finalTitle}\n\nFINAL-BODY-MUST-REMAIN`,
    ];
    const content = createProductionPresentationFromOutline(`# Large deck\n\n${sections.join('\n\n')}`);
    expect(content.slides).toHaveLength(500);
    expect(content.slides[content.slides.length - 1]).toMatchObject({
      title: finalTitle,
      body: { value: 'FINAL-BODY-MUST-REMAIN' },
    });
  });

  it('rejects outlines above 500 slides before creating a truncated presentation', () => {
    const sections = Array.from({ length: 500 }, (_, index) => `## Slide ${index + 1}\n\nBody`);
    try {
      createProductionPresentationFromOutline(`# Too large\n\n${sections.join('\n\n')}`);
      throw new Error('Expected the oversized outline to be rejected');
    } catch (error) {
      expect(isProductionPresentationOutlineSlideLimitError(error)).toBe(true);
      if (isProductionPresentationOutlineSlideLimitError(error)) {
        expect(error.slideCount).toBe(501);
        expect(error.maxSlides).toBe(500);
      }
    }
  });

  it('preserves supported, complex and cross-sheet formula caches through import, open, save and export', async () => {
    const source = new ExcelJS.Workbook();
    const budget = source.addWorksheet('Budget');
    budget.getCell('A1').value = 'Item';
    budget.getCell('B2').value = 20;
    budget.getCell('C2').value = { formula: 'B2*2', result: 40 };
    budget.getCell('C3').value = { formula: 'IF(B2>0,"positive","negative")', result: 'positive' };
    budget.getCell('XFD1048576').value = 'Excel boundary';
    const notes = source.addWorksheet('Notes');
    notes.getCell('A1').value = 'Keep me';
    notes.getCell('B1').value = { formula: 'Budget!B2*3', result: 60 };
    const buffer = await source.xlsx.writeBuffer();
    const result = await importProductionWorkbookFile(
      new File([buffer as BlobPart], 'plan.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    expect(result.content.sheets).toHaveLength(2);
    expect(result.content.sheets[0]?.cells.C2).toEqual({ value: 40, formula: 'B2*2' });
    expect(result.content.sheets[0]?.cells.C3).toEqual({
      value: 'positive',
      formula: 'IF(B2>0,"positive","negative")',
    });
    expect(result.content.sheets[0]?.cells.XFD1048576?.value).toBe('Excel boundary');
    expect(result.content.sheets[1]?.cells.A1?.value).toBe('Keep me');
    expect(result.content.sheets[1]?.cells.B1).toEqual({ value: 60, formula: 'Budget!B2*3' });
    expect(validateProductionProjectContent(result.content, 'workbook')).toBe(true);

    const opened = cloneProductionWorkbook(result.content);
    opened.sheets[0]!.cells.C3 = parseWorkbookFormulaBarValue(
      '  =IF(B2>0,"positive","negative")  ',
      opened.sheets[0]!.cells.C3,
    )!;
    opened.sheets[1]!.cells.B1 = parseWorkbookFormulaBarValue('Budget!B2*3', opened.sheets[1]!.cells.B1)!;
    opened.sheets[0]!.cells.Z10 = { value: 'unrelated edit' };
    expect(recalculateWorkbookSheet(opened.sheets[0]!, ['Z10'])).toEqual({ formulaCount: 0, errorCount: 0 });
    const saved = normalizeProductionProjectContent(opened, 'workbook') as ProductionWorkbookContentV1;
    const exported = await exportProductionWorkbookXlsx(saved, result.title);
    const roundTripped = new ExcelJS.Workbook();
    await roundTripped.xlsx.load(await exported.blob.arrayBuffer());
    expect(roundTripped.getWorksheet('Budget')!.getCell('C2').value).toMatchObject({ formula: 'B2*2', result: 40 });
    expect(roundTripped.getWorksheet('Budget')!.getCell('C3').value).toMatchObject({
      formula: 'IF(B2>0,"positive","negative")',
      result: 'positive',
    });
    expect(roundTripped.getWorksheet('Budget')!.getCell('XFD1048576').value).toBe('Excel boundary');
    expect(roundTripped.getWorksheet('Notes')!.getCell('B1').value).toMatchObject({
      formula: 'Budget!B2*3',
      result: 60,
    });
  });

  it('imports CSV as editable typed cells', async () => {
    const result = await importProductionWorkbookFile(new File(['Name,Count\nLightNote,12'], 'items.csv'));
    expect(result.content.sheets[0]?.cells.A1?.value).toBe('Name');
    expect(result.content.sheets[0]?.cells.B2?.value).toBe(12);
  });
});
