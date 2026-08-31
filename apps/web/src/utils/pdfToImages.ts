import { safeDownloadBaseName } from '@/utils/toolboxLocal';

export const PDF_TO_IMAGES_MAX_FILES = 4;
export const PDF_TO_IMAGES_MAX_BYTES = 80 * 1024 * 1024;
export const PDF_TO_IMAGES_MAX_PAGES = 200;
export const PDF_TO_IMAGES_MAX_PAGE_PIXELS = 24_000_000;

export type PdfImageFormat = 'image/jpeg' | 'image/png';

export interface PdfToImagesOptions {
  format: PdfImageFormat;
  quality: number;
  scale: 1 | 1.5 | 2;
}

export interface PdfImageResult {
  id: string;
  sourceName: string;
  pageNumber: number;
  width: number;
  height: number;
  blob: Blob;
  fileName: string;
  previewUrl: string;
}

export class PdfToImagesError extends Error {
  constructor(
    public readonly code:
      'INVALID_TYPE' | 'TOO_MANY' | 'TOO_LARGE' | 'TOO_MANY_PAGES' | 'INVALID_PDF' | 'ENCODE_FAILED',
  ) {
    super(code);
    this.name = 'PdfToImagesError';
  }
}

let pdfRuntimePromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null;

export async function loadPdfRuntime() {
  if (!pdfRuntimePromise) {
    pdfRuntimePromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([pdfjs, workerModule]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfjs;
    });
  }
  return pdfRuntimePromise;
}

export function validatePdfToImageFiles(files: File[]) {
  if (
    !files.length ||
    files.some((file) => file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))
  ) {
    throw new PdfToImagesError('INVALID_TYPE');
  }
  if (files.length > PDF_TO_IMAGES_MAX_FILES) throw new PdfToImagesError('TOO_MANY');
  if (files.reduce((sum, file) => sum + file.size, 0) > PDF_TO_IMAGES_MAX_BYTES) {
    throw new PdfToImagesError('TOO_LARGE');
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, format: PdfImageFormat, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PdfToImagesError('ENCODE_FAILED'))),
      format,
      format === 'image/png' ? undefined : Math.min(1, Math.max(0.5, quality)),
    );
  });
}

export async function convertPdfsToImages(
  files: File[],
  options: PdfToImagesOptions,
  onProgress?: (completed: number, total: number) => void,
): Promise<PdfImageResult[]> {
  validatePdfToImageFiles(files);
  const pdfjs = await loadPdfRuntime();
  const opened: Array<{ file: File; document: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']> }> = [];
  const results: PdfImageResult[] = [];
  let completedSuccessfully = false;

  try {
    let totalPages = 0;
    for (const file of files) {
      try {
        const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
        const document = await task.promise;
        opened.push({ file, document });
        totalPages += document.numPages;
        if (totalPages > PDF_TO_IMAGES_MAX_PAGES) throw new PdfToImagesError('TOO_MANY_PAGES');
      } catch (error) {
        if (error instanceof PdfToImagesError) throw error;
        throw new PdfToImagesError('INVALID_PDF');
      }
    }

    let completed = 0;
    for (const source of opened) {
      const baseName = safeDownloadBaseName(source.file.name);
      for (let pageNumber = 1; pageNumber <= source.document.numPages; pageNumber += 1) {
        const page = await source.document.getPage(pageNumber);
        try {
          const base = page.getViewport({ scale: 1 });
          const pixelScale = Math.sqrt(PDF_TO_IMAGES_MAX_PAGE_PIXELS / Math.max(1, base.width * base.height));
          const scale = Math.min(options.scale, pixelScale);
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));
          const context = canvas.getContext('2d', { alpha: options.format === 'image/png' });
          if (!context) throw new PdfToImagesError('ENCODE_FAILED');
          if (options.format === 'image/jpeg') {
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
          }
          await page.render({ canvasContext: context, viewport }).promise;
          const blob = await canvasToBlob(canvas, options.format, options.quality);
          const extension = options.format === 'image/png' ? 'png' : 'jpg';
          results.push({
            id: `${baseName}:${pageNumber}`,
            sourceName: source.file.name,
            pageNumber,
            width: canvas.width,
            height: canvas.height,
            blob,
            fileName: `${baseName}-page-${String(pageNumber).padStart(3, '0')}.${extension}`,
            previewUrl: URL.createObjectURL(blob),
          });
        } finally {
          page.cleanup();
        }
        completed += 1;
        onProgress?.(completed, totalPages);
      }
    }
    completedSuccessfully = true;
    return results;
  } finally {
    if (!completedSuccessfully) releasePdfImageResults(results);
    await Promise.allSettled(opened.map(({ document }) => document.destroy()));
  }
}

export function releasePdfImageResults(results: PdfImageResult[]) {
  results.forEach((result) => URL.revokeObjectURL(result.previewUrl));
}

export async function bundlePdfImageResults(results: PdfImageResult[]) {
  const { default: JSZip } = await import('jszip');
  const archive = new JSZip();
  const usedNames = new Map<string, number>();
  for (const result of results) {
    const seen = usedNames.get(result.fileName) || 0;
    usedNames.set(result.fileName, seen + 1);
    const dot = result.fileName.lastIndexOf('.');
    const name =
      seen && dot > 0 ? `${result.fileName.slice(0, dot)}-${seen + 1}${result.fileName.slice(dot)}` : result.fileName;
    archive.file(name, result.blob);
  }
  return archive.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
