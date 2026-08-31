import { createLocalId, safeDownloadBaseName } from '@/utils/toolboxLocal';
import { loadPdfJsRuntime } from '@/utils/pdfJsRuntime';

export const PDF_ORGANIZER_MAX_FILES = 8;
export const PDF_ORGANIZER_MAX_BYTES = 80 * 1024 * 1024;
export const PDF_ORGANIZER_MAX_PAGES = 400;

export interface PdfOrganizerSource {
  id: string;
  name: string;
  size: number;
  bytes: Uint8Array;
  pageCount: number;
}

export interface PdfOrganizerPage {
  id: string;
  sourceId: string;
  sourcePageIndex: number;
  sourceName: string;
  rotation: number;
  selected: boolean;
}

export interface PdfOrganizerWorkspace {
  sources: PdfOrganizerSource[];
  pages: PdfOrganizerPage[];
}

export class PdfOrganizerError extends Error {
  constructor(public readonly code: 'INVALID_TYPE' | 'TOO_MANY' | 'TOO_LARGE' | 'TOO_MANY_PAGES' | 'INVALID_PDF') {
    super(code);
    this.name = 'PdfOrganizerError';
  }
}

export async function parsePdfFiles(files: File[]): Promise<PdfOrganizerWorkspace> {
  if (!files.length) return { sources: [], pages: [] };
  if (files.length > PDF_ORGANIZER_MAX_FILES) throw new PdfOrganizerError('TOO_MANY');
  if (files.some((file) => file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) {
    throw new PdfOrganizerError('INVALID_TYPE');
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > PDF_ORGANIZER_MAX_BYTES) {
    throw new PdfOrganizerError('TOO_LARGE');
  }

  const { PDFDocument } = await import('pdf-lib');
  const sources: PdfOrganizerSource[] = [];
  const pages: PdfOrganizerPage[] = [];
  try {
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const document = await PDFDocument.load(bytes, { updateMetadata: false });
      const source: PdfOrganizerSource = {
        id: createLocalId('pdf-source'),
        name: file.name,
        size: file.size,
        bytes,
        pageCount: document.getPageCount(),
      };
      sources.push(source);
      for (let sourcePageIndex = 0; sourcePageIndex < source.pageCount; sourcePageIndex += 1) {
        pages.push({
          id: createLocalId('pdf-page'),
          sourceId: source.id,
          sourcePageIndex,
          sourceName: source.name,
          rotation: 0,
          selected: false,
        });
      }
      if (pages.length > PDF_ORGANIZER_MAX_PAGES) throw new PdfOrganizerError('TOO_MANY_PAGES');
    }
  } catch (error) {
    if (error instanceof PdfOrganizerError) throw error;
    throw new PdfOrganizerError('INVALID_PDF');
  }
  return { sources, pages };
}

export async function exportPdfPages(
  sources: PdfOrganizerSource[],
  pages: PdfOrganizerPage[],
): Promise<{ blob: Blob; fileName: string }> {
  if (!pages.length) throw new PdfOrganizerError('INVALID_PDF');
  const { PDFDocument, degrees } = await import('pdf-lib');
  const output = await PDFDocument.create();
  const sourceDocuments = new Map<string, Awaited<ReturnType<typeof PDFDocument.load>>>();

  for (const source of sources) {
    if (!pages.some((page) => page.sourceId === source.id)) continue;
    sourceDocuments.set(source.id, await PDFDocument.load(source.bytes, { updateMetadata: false }));
  }
  for (const page of pages) {
    const source = sourceDocuments.get(page.sourceId);
    if (!source) continue;
    const [copied] = await output.copyPages(source, [page.sourcePageIndex]);
    if (!copied) continue;
    const originalRotation = Number(copied.getRotation()?.angle || 0);
    copied.setRotation(degrees((((originalRotation + page.rotation) % 360) + 360) % 360));
    output.addPage(copied);
  }
  if (!output.getPageCount()) throw new PdfOrganizerError('INVALID_PDF');
  output.setProducer('Light Note Knowledge Toolbox');
  const bytes = await output.save({ useObjectStreams: true });
  const baseName = sources.length === 1 ? safeDownloadBaseName(sources[0]?.name || '') : 'lightnote-merged';
  return {
    blob: new Blob([bytes as BlobPart], { type: 'application/pdf' }),
    fileName: `${baseName}-organized.pdf`,
  };
}

type PdfJsRuntime = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfLoadingTask = ReturnType<PdfJsRuntime['getDocument']>;
type PdfDocumentProxy = Awaited<PdfLoadingTask['promise']>;

const thumbnailDocuments = new Map<string, Promise<PdfDocumentProxy>>();
const thumbnailQueue: Array<() => void> = [];
const MAX_CONCURRENT_THUMBNAILS = 3;
let activeThumbnailRenders = 0;

async function acquireThumbnailSlot() {
  if (activeThumbnailRenders >= MAX_CONCURRENT_THUMBNAILS) {
    await new Promise<void>((resolve) => thumbnailQueue.push(resolve));
  }
  activeThumbnailRenders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeThumbnailRenders = Math.max(0, activeThumbnailRenders - 1);
    thumbnailQueue.shift()?.();
  };
}

async function getThumbnailDocument(source: PdfOrganizerSource) {
  const cached = thumbnailDocuments.get(source.id);
  if (cached) return cached;
  const promise = loadPdfJsRuntime()
    .then((pdfjs) => pdfjs.getDocument({ data: source.bytes.slice() }).promise)
    .catch((error) => {
      thumbnailDocuments.delete(source.id);
      throw error;
    });
  thumbnailDocuments.set(source.id, promise);
  return promise;
}

/** Release cached PDF.js documents when a local workspace leaves the page. */
export async function releasePdfThumbnailSources(sourceIds: string[]) {
  const documents = sourceIds
    .map((sourceId) => {
      const document = thumbnailDocuments.get(sourceId);
      thumbnailDocuments.delete(sourceId);
      return document;
    })
    .filter(Boolean) as Promise<PdfDocumentProxy>[];
  await Promise.allSettled(documents.map(async (document) => (await document).destroy()));
}

/** Render only visible page thumbnails; callers decide visibility with IntersectionObserver. */
export async function renderPdfPageThumbnail(source: PdfOrganizerSource, sourcePageIndex: number, maxWidth = 220) {
  const releaseSlot = await acquireThumbnailSlot();
  let page: Awaited<ReturnType<PdfDocumentProxy['getPage']>> | null = null;
  try {
    const pdfDocument = await getThumbnailDocument(source);
    page = await pdfDocument.getPage(sourcePageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(1.5, maxWidth / Math.max(1, base.width)) });
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    page?.cleanup();
    releaseSlot();
  }
}
