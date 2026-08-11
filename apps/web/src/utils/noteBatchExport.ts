import { buildExportFileName } from '@/utils/fileDelivery';

export type NoteBatchExportMode = 'original' | 'html' | 'markdown' | 'pdf';
export type NoteBatchExportFileFormat = 'html' | 'md' | 'pdf';

export interface BatchExportNote {
  id: string;
  title?: string | null;
  content?: string | null;
  type?: string | null;
}

export interface BatchExportEntry {
  noteId: string;
  fileName: string;
  format: NoteBatchExportFileFormat;
  content: string | Blob;
}

interface BuildBatchExportOptions {
  fallbackTitle: string;
  lang?: string;
  onProgress?: (completed: number, total: number) => void;
  pdfGenerator?: (html: string) => Promise<Blob>;
}

export function resolveBatchNoteExportFormat(
  noteType: string | null | undefined,
  mode: NoteBatchExportMode,
): NoteBatchExportFileFormat {
  if (mode === 'html') return 'html';
  if (mode === 'markdown') return 'md';
  if (mode === 'pdf') return 'pdf';
  return noteType === 'markdown' || noteType === 'md' ? 'md' : 'html';
}

export function makeUniqueBatchExportFileName(
  title: string,
  fallbackTitle: string,
  format: NoteBatchExportFileFormat,
  usedNames: Set<string>,
) {
  const original = buildExportFileName(title, fallbackTitle, format);
  const extension = `.${format}`;
  const base = original.slice(0, -extension.length);
  let candidate = original;
  let suffix = 2;
  while (usedNames.has(candidate.toLocaleLowerCase())) {
    candidate = `${base} (${suffix})${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate.toLocaleLowerCase());
  return candidate;
}

async function buildHtmlDocument(note: BatchExportNote, title: string, lang: string) {
  const { buildNoteExportHtml, inlineMermaidForExport, renderMarkdownForExport } = await import('@/utils/noteExport');
  const content = String(note.content || '');
  const body =
    note.type === 'markdown' || note.type === 'md'
      ? await renderMarkdownForExport(content)
      : await inlineMermaidForExport(content);
  return buildNoteExportHtml(title, body, lang);
}

export async function buildBatchNoteExportEntries(
  notes: BatchExportNote[],
  mode: NoteBatchExportMode,
  options: BuildBatchExportOptions,
) {
  const usedNames = new Set<string>();
  const entries: BatchExportEntry[] = [];
  const failedNoteIds: string[] = [];
  let markdownConverterPromise: Promise<(html: string) => string> | null = null;
  let pdfGeneratorPromise: Promise<(html: string) => Promise<Blob>> | null = null;

  const getMarkdownConverter = () => {
    if (!markdownConverterPromise) {
      markdownConverterPromise = import('@/utils/noteHtmlToMarkdown').then(({ createNoteTurndownService }) => {
        const service = createNoteTurndownService();
        return (html: string) => service.turndown(html);
      });
    }
    return markdownConverterPromise;
  };

  const getPdfGenerator = () => {
    if (options.pdfGenerator) return Promise.resolve(options.pdfGenerator);
    if (!pdfGeneratorPromise) {
      pdfGeneratorPromise = import('@/utils/htmlToPdf').then(({ generatePdfBlobFromHtml }) => generatePdfBlobFromHtml);
    }
    return pdfGeneratorPromise;
  };

  for (const [index, note] of notes.entries()) {
    try {
      const format = resolveBatchNoteExportFormat(note.type, mode);
      const title = String(note.title || '').trim() || options.fallbackTitle;
      const fileName = makeUniqueBatchExportFileName(title, options.fallbackTitle, format, usedNames);
      let content: string | Blob;

      if (format === 'html') {
        content = await buildHtmlDocument(note, title, options.lang || 'zh-CN');
      } else if (format === 'md') {
        const { buildNoteExportMarkdown } = await import('@/utils/noteExport');
        const htmlToMarkdown = await getMarkdownConverter();
        const storedType = note.type === 'md' ? 'markdown' : String(note.type || 'html');
        content = buildNoteExportMarkdown(
          title,
          String(note.content || ''),
          storedType,
          htmlToMarkdown,
        );
      } else {
        const html = await buildHtmlDocument(note, title, options.lang || 'zh-CN');
        content = await (await getPdfGenerator())(html);
      }

      entries.push({ noteId: String(note.id), fileName, format, content });
    } catch (error) {
      console.error('批量笔记导出转换失败:', error);
      failedNoteIds.push(String(note.id));
    } finally {
      options.onProgress?.(index + 1, notes.length);
    }
  }

  return { entries, failedNoteIds };
}

export async function buildBatchNoteExportArchive(
  notes: BatchExportNote[],
  mode: NoteBatchExportMode,
  options: BuildBatchExportOptions,
) {
  const { entries, failedNoteIds } = await buildBatchNoteExportEntries(notes, mode, options);
  if (!entries.length) return { blob: null, entries, failedNoteIds };

  const { default: JSZip } = await import('jszip');
  const archive = new JSZip();
  entries.forEach((entry) => archive.file(entry.fileName, entry.content));
  const blob = await archive.generateAsync({
    type: 'blob',
    mimeType: 'application/zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { blob, entries, failedNoteIds };
}
