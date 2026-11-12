import { loadPdfRuntime, validatePdfToImageFiles } from '@/utils/pdfToImages';

export interface PdfTextPage {
  page: number;
  text: string;
  characters: number;
}

export interface PdfTextFileResult {
  name: string;
  pages: PdfTextPage[];
  text: string;
}

export async function extractPdfText(
  files: File[],
  onProgress?: (completed: number, total: number) => void,
): Promise<PdfTextFileResult[]> {
  validatePdfToImageFiles(files);
  const pdfjs = await loadPdfRuntime();
  const opened: Array<{ file: File; document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']> }> = [];
  try {
    let total = 0;
    for (const file of files) {
      const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
      const document = await task.promise;
      opened.push({ file, document });
      total += document.numPages;
      if (total > 500) throw new Error('TOO_MANY_PAGES');
    }
    let completed = 0;
    const results: PdfTextFileResult[] = [];
    for (const source of opened) {
      const pages: PdfTextPage[] = [];
      for (let pageNumber = 1; pageNumber <= source.document.numPages; pageNumber += 1) {
        const page = await source.document.getPage(pageNumber);
        try {
          const content = await page.getTextContent();
          const chunks: string[] = [];
          for (const item of content.items) {
            if (!('str' in item)) continue;
            const value = String(item.str || '');
            if (value) chunks.push(value);
            if ('hasEOL' in item && item.hasEOL) chunks.push('\n');
            else if (value && !value.endsWith(' ')) chunks.push(' ');
          }
          const text = chunks
            .join('')
            .replace(/[ \t]+\n/gu, '\n')
            .replace(/\n{3,}/gu, '\n\n')
            .trim();
          pages.push({ page: pageNumber, text, characters: text.length });
        } finally {
          page.cleanup();
        }
        completed += 1;
        onProgress?.(completed, total);
      }
      results.push({
        name: source.file.name,
        pages,
        text: pages.map((page) => `## Page ${page.page}\n\n${page.text || '[No text layer]'}`).join('\n\n'),
      });
    }
    return results;
  } finally {
    await Promise.allSettled(opened.map(({ document }) => document.destroy()));
  }
}
