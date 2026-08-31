import {
  PRODUCTION_PROJECT_LIMITS,
  PRODUCTION_WORKBOOK_MAX_COLUMNS,
  PRODUCTION_WORKBOOK_MAX_ROWS,
  normalizeProductionProjectContent,
  type ProductionDocumentContentV1,
  type ProductionPresentationContentV1,
  type ProductionPresentationSlideV1,
  type ProductionWorkbookCellV1,
  type ProductionWorkbookContentV1,
  type ProductionWorkbookSheetV1,
} from '@lightnote/shared/production-project-protocol';
import { convertDocxToMarkdown } from '@/utils/toolboxDocumentText';
import {
  TOOLBOX_DATASET_MAX_BYTES,
  inferDatasetFileFormat,
  readToolboxDatasetFile,
  type ToolboxDataset,
} from '@/utils/toolboxDataset';
import { workbookCellAddress } from '@/utils/productionWorkbookEditor';

export type ProductionProjectImportKind = 'document' | 'presentation-outline' | 'workbook';

export type ProductionProjectImportResult<T> = Readonly<{
  title: string;
  content: T;
  warnings: readonly string[];
}>;

const DOCUMENT_TEXT_MAX_BYTES = 5 * 1024 * 1024;
const DOCUMENT_DOCX_MAX_BYTES = 20 * 1024 * 1024;
const PRESENTATION_OUTLINE_MAX_BYTES = 2 * 1024 * 1024;
const PRESENTATION_SLIDE_MAX = 500;

export class ProductionPresentationOutlineSlideLimitError extends Error {
  readonly code = 'PRESENTATION_OUTLINE_SLIDE_LIMIT';
  readonly slideCount: number;
  readonly maxSlides = PRESENTATION_SLIDE_MAX;

  constructor(slideCount: number) {
    super(`Presentation outline contains ${slideCount} slides; the maximum is ${PRESENTATION_SLIDE_MAX}`);
    this.name = 'ProductionPresentationOutlineSlideLimitError';
    this.slideCount = slideCount;
  }
}

export function isProductionPresentationOutlineSlideLimitError(
  error: unknown,
): error is ProductionPresentationOutlineSlideLimitError {
  return (
    error instanceof ProductionPresentationOutlineSlideLimitError ||
    (error instanceof Error &&
      (error as ProductionPresentationOutlineSlideLimitError).code === 'PRESENTATION_OUTLINE_SLIDE_LIMIT')
  );
}

function fileExtension(fileName: string) {
  const match = /\.([^.]+)$/u.exec(String(fileName || '').toLocaleLowerCase());
  return match?.[1] || '';
}

export function productionImportTitle(fileName: string, fallback = 'Untitled') {
  const normalized = String(fileName || '')
    .replace(/\.[^.]+$/u, '')
    .trim();
  return normalized || fallback;
}

export function inferProductionProjectImportKind(fileName: string): ProductionProjectImportKind | null {
  const extension = fileExtension(fileName);
  if (['docx', 'md', 'markdown', 'txt'].includes(extension)) return 'document';
  if (['ppt-outline', 'outline'].includes(extension)) return 'presentation-outline';
  if (['csv', 'tsv', 'tab', 'json', 'xlsx'].includes(extension)) return 'workbook';
  return null;
}

export async function importProductionDocumentFile(
  file: File,
): Promise<ProductionProjectImportResult<ProductionDocumentContentV1>> {
  const extension = fileExtension(file.name);
  if (!['docx', 'md', 'markdown', 'txt'].includes(extension)) throw new Error('UNSUPPORTED_DOCUMENT_IMPORT');
  if (file.size > (extension === 'docx' ? DOCUMENT_DOCX_MAX_BYTES : DOCUMENT_TEXT_MAX_BYTES)) {
    throw new Error('DOCUMENT_IMPORT_TOO_LARGE');
  }
  const warnings: string[] = [];
  let markdown = '';
  if (extension === 'docx') {
    const converted = await convertDocxToMarkdown(file);
    markdown = converted.markdown;
    if (converted.stats.images) warnings.push('DOCX_IMAGES_NOT_EMBEDDED');
  } else {
    markdown = await file.text();
  }
  const content = normalizeProductionProjectContent(
    {
      type: 'document',
      schemaVersion: 1,
      body: { format: 'markdown', value: markdown },
      page: { size: 'a4', orientation: 'portrait' },
      extensions: { importedFrom: extension },
    },
    'document',
  ) as ProductionDocumentContentV1;
  return { title: productionImportTitle(file.name), content, warnings };
}

type ParsedOutlineSlide = { title: string; lines: string[]; layout: ProductionPresentationSlideV1['layout'] };

function outlineSlides(source: string) {
  const lines = String(source || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n');
  let deckTitle = '';
  const intro: string[] = [];
  const parsedSlides: ParsedOutlineSlide[] = [];
  let current: ParsedOutlineSlide | null = null;

  function pushCurrent() {
    if (!current) return;
    current.lines = current.lines.filter((line, index, values) => line.trim() || values[index - 1]?.trim());
    parsedSlides.push(current);
    current = null;
  }

  for (const rawLine of lines) {
    const heading = /^(#{1,3})\s+(.+?)\s*$/u.exec(rawLine);
    if (heading?.[1] === '#' && !deckTitle && parsedSlides.length === 0 && !current) {
      deckTitle = heading[2]!.trim();
      continue;
    }
    if (heading && heading[1]!.length >= 2) {
      pushCurrent();
      current = { title: heading[2]!.trim(), lines: [], layout: heading[1] === '##' ? 'content' : 'section' };
      continue;
    }
    if (/^---+\s*$/u.test(rawLine)) {
      pushCurrent();
      continue;
    }
    if (current) current.lines.push(rawLine);
    else intro.push(rawLine);
  }
  pushCurrent();

  if (parsedSlides.length === 0) {
    const blocks = intro
      .join('\n')
      .split(/\n\s*\n/u)
      .map((block) => block.trim())
      .filter(Boolean);
    if (!deckTitle && blocks.length)
      deckTitle = blocks
        .shift()!
        .split('\n')[0]!
        .replace(/^#+\s*/u, '')
        .trim();
    blocks.forEach((block, index) => {
      const blockLines = block.split('\n');
      parsedSlides.push({
        title:
          blockLines
            .shift()
            ?.replace(/^[-*+]\s*/u, '')
            .trim() || `Slide ${index + 2}`,
        lines: blockLines,
        layout: 'content',
      });
    });
  }

  return { deckTitle: deckTitle || 'Untitled presentation', intro: intro.join('\n').trim(), slides: parsedSlides };
}

export function createProductionPresentationFromOutline(
  source: string,
  fallbackTitle = 'Untitled presentation',
): ProductionPresentationContentV1 {
  const parsed = outlineSlides(source);
  const title = parsed.deckTitle === 'Untitled presentation' ? fallbackTitle : parsed.deckTitle;
  const requestedSlideCount = parsed.slides.length + 1;
  if (requestedSlideCount > PRESENTATION_SLIDE_MAX) {
    throw new ProductionPresentationOutlineSlideLimitError(requestedSlideCount);
  }
  const slides: ProductionPresentationSlideV1[] = [
    {
      id: 'import-slide-1',
      title,
      body: { format: 'markdown', value: parsed.intro },
      notes: '',
      layout: 'title',
      extensions: {},
    },
    ...parsed.slides.map((item, index) => ({
      id: `import-slide-${index + 2}`,
      title: item.title || `Slide ${index + 2}`,
      body: { format: 'markdown' as const, value: item.lines.join('\n').trim() },
      notes: '',
      layout: item.layout,
      extensions: {},
    })),
  ];
  return normalizeProductionProjectContent(
    {
      type: 'presentation',
      schemaVersion: 1,
      canvas: { aspectRatio: '16:9' },
      theme: { name: 'lightnote', accent: '#3175cc', background: '#ffffff' },
      slides,
      extensions: { importedFrom: 'outline' },
    },
    'presentation',
  ) as ProductionPresentationContentV1;
}

export async function importProductionPresentationOutline(
  file: File,
): Promise<ProductionProjectImportResult<ProductionPresentationContentV1>> {
  if (file.size > PRESENTATION_OUTLINE_MAX_BYTES) throw new Error('PRESENTATION_OUTLINE_TOO_LARGE');
  const extension = fileExtension(file.name);
  if (!['md', 'markdown', 'txt', 'outline', 'ppt-outline'].includes(extension)) {
    throw new Error('UNSUPPORTED_PRESENTATION_IMPORT');
  }
  const fallbackTitle = productionImportTitle(file.name, 'Untitled presentation');
  const content = createProductionPresentationFromOutline(await file.text(), fallbackTitle);
  const title = content.slides[0]?.title || fallbackTitle;
  return { title, content, warnings: [] };
}

function datasetCellValue(value: string): ProductionWorkbookCellV1 {
  const trimmed = value.trim();
  if (/^(?:true|false)$/iu.test(trimmed)) return { value: trimmed.toLocaleLowerCase() === 'true' };
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(trimmed)) {
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return { value: numeric };
  }
  return { value };
}

function sheetFromDataset(dataset: ToolboxDataset): ProductionWorkbookSheetV1 {
  const cells: ProductionWorkbookSheetV1['cells'] = {};
  dataset.headers.forEach((header, columnIndex) => {
    cells[workbookCellAddress(1, columnIndex + 1)] = { value: header };
  });
  dataset.rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      if (!value) return;
      cells[workbookCellAddress(rowIndex + 2, columnIndex + 1)] = datasetCellValue(value);
    });
  });
  return {
    id: 'import-sheet-1',
    name: productionImportTitle(dataset.name, 'Sheet 1').slice(0, 100),
    cells,
    extensions: {},
  };
}

function excelValue(value: unknown): string | number | boolean | null {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.text === 'string') return candidate.text;
    if (Array.isArray(candidate.richText)) {
      return candidate.richText
        .map((item) => (item && typeof item === 'object' ? String((item as { text?: unknown }).text || '') : ''))
        .join('');
    }
    if (candidate.error) return String(candidate.error);
  }
  return String(value);
}

async function sheetsFromXlsx(file: File): Promise<ProductionWorkbookSheetV1[]> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await file.arrayBuffer()) as ArrayBuffer);
  if (!workbook.worksheets.length) throw new Error('INVALID_WORKBOOK_IMPORT');
  if (workbook.worksheets.length > 100) throw new Error('WORKBOOK_IMPORT_TOO_LARGE');
  return workbook.worksheets.map((worksheet, sheetIndex) => {
    if (worksheet.rowCount > PRODUCTION_WORKBOOK_MAX_ROWS || worksheet.columnCount > PRODUCTION_WORKBOOK_MAX_COLUMNS) {
      throw new Error('WORKBOOK_IMPORT_TOO_LARGE');
    }
    const cells: ProductionWorkbookSheetV1['cells'] = {};
    let cellCount = 0;
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        const formula = cell.formula ? String(cell.formula).replace(/^=/u, '') : '';
        const value = excelValue(formula ? cell.result : cell.value);
        if (formula || value !== null) {
          cellCount += 1;
          if (cellCount > PRODUCTION_PROJECT_LIMITS.maxCellsPerSheet) {
            throw new Error('WORKBOOK_IMPORT_TOO_LARGE');
          }
          cells[workbookCellAddress(rowNumber, columnNumber)] = formula ? { value, formula } : { value };
        }
      });
    });
    return {
      id: `import-sheet-${sheetIndex + 1}`,
      name: String(worksheet.name || `Sheet ${sheetIndex + 1}`).slice(0, 100),
      cells,
      extensions: {},
    };
  });
}

export async function importProductionWorkbookFile(
  file: File,
): Promise<ProductionProjectImportResult<ProductionWorkbookContentV1>> {
  if (file.size > TOOLBOX_DATASET_MAX_BYTES) throw new Error('WORKBOOK_IMPORT_TOO_LARGE');
  const format = inferDatasetFileFormat(file.name);
  if (!format || !['csv', 'tsv', 'json', 'xlsx'].includes(format)) throw new Error('UNSUPPORTED_WORKBOOK_IMPORT');
  const sheets =
    format === 'xlsx' ? await sheetsFromXlsx(file) : [sheetFromDataset(await readToolboxDatasetFile(file))];
  const content = normalizeProductionProjectContent(
    {
      type: 'workbook',
      schemaVersion: 1,
      sheets,
      activeSheetId: sheets[0]?.id || null,
      extensions: { importedFrom: format },
    },
    'workbook',
  ) as ProductionWorkbookContentV1;
  return { title: productionImportTitle(file.name), content, warnings: [] };
}
