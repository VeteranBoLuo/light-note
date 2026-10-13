import { parseDelimitedTable, ToolboxTextError } from '@/utils/toolboxTextTools';

export const MAX_CSV_PREVIEW_CHARS = 1_000_000;

export function csvPreviewError(code: 'FILE_SIZE_INVALID' | 'FILE_CONTENT_INVALID') {
  return Object.assign(new Error(code), { code });
}

/** 只解析分隔符，不将内容推断为公式、数字或日期。 */
export function parseCsvPreview(source: string): string[][] {
  let rows: string[][];
  try {
    rows = parseDelimitedTable(source.replace(/^\uFEFF/u, ''), ',');
  } catch (error) {
    throw csvPreviewError(
      error instanceof ToolboxTextError && error.code === 'INPUT_TOO_LARGE'
        ? 'FILE_SIZE_INVALID'
        : 'FILE_CONTENT_INVALID',
    );
  }
  if (rows.length * rows[0].length > 100_000) throw csvPreviewError('FILE_SIZE_INVALID');
  return rows;
}
