import { buildExportFileName } from '@/utils/fileDelivery';

export type NoteBatchExportMode = 'original' | 'html' | 'markdown' | 'pdf';
export type NoteBatchExportFileFormat = 'html' | 'md' | 'pdf' | 'json';

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
  paths?: Map<string, string>;
  pdfGenerator?: (html: string) => Promise<Blob>;
}

export function resolveBatchNoteExportFormat(
  noteType: string | null | undefined,
  mode: NoteBatchExportMode,
): NoteBatchExportFileFormat {
  if (mode === 'html') return 'html';
  if (mode === 'markdown') return 'md';
  if (mode === 'pdf') return 'pdf';
  if (noteType === 'drawing') return 'json';
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
    if (note.type === 'drawing' && mode !== 'original') {
      failedNoteIds.push(String(note.id));
      options.onProgress?.(index + 1, notes.length);
      continue;
    }
    try {
      const format = resolveBatchNoteExportFormat(note.type, mode);
      const title = String(note.title || '').trim() || options.fallbackTitle;
      const fileName = makeUniqueBatchExportFileName(title, options.fallbackTitle, format, usedNames);
      let content: string | Blob;

      if (format === 'json') {
        content = String(note.content || '');
      } else if (format === 'html') {
        content = await buildHtmlDocument(note, title, options.lang || 'zh-CN');
      } else if (format === 'md') {
        const { buildNoteExportMarkdown } = await import('@/utils/noteExport');
        const htmlToMarkdown = await getMarkdownConverter();
        const storedType = note.type === 'md' ? 'markdown' : String(note.type || 'html');
        content = buildNoteExportMarkdown(title, String(note.content || ''), storedType, htmlToMarkdown);
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
  entries.forEach((entry) =>
    archive.file(
      options.paths?.has(entry.noteId) ? `${options.paths.get(entry.noteId)}.${entry.format}` : entry.fileName,
      entry.content,
    ),
  );
  const blob = await archive.generateAsync({
    type: 'blob',
    mimeType: 'application/zip',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { blob, entries, failedNoteIds };
}

export type NoteExportPackaging = 'archive' | 'merged';
export type NoteMergedExportFormat = Exclude<NoteBatchExportMode, 'original'>;
export interface NoteExportSettings {
  packaging: NoteExportPackaging;
  archiveFormat: NoteBatchExportMode;
  mergedFormat: NoteMergedExportFormat;
  orderedIds: string[];
  exportName: string;
  defaultName: string;
  showDocumentTitle: boolean;
  keepNoteTitles: boolean;
}
export function defaultMergedExportName() {
  return `lightnote-notes-${new Date().toISOString().slice(0, 10)}`;
}
export function createNoteExportSettings(
  notes: Pick<BatchExportNote, 'id' | 'type'>[] = [],
  defaultName = defaultMergedExportName(),
): NoteExportSettings {
  const markdownCount = notes.filter((note) => note.type === 'markdown' || note.type === 'md').length;
  const htmlCount = notes.filter((note) => !note.type || note.type === 'html').length;
  return {
    exportName: '',
    defaultName,
    showDocumentTitle: false,
    keepNoteTitles: true,
    packaging: 'archive',
    archiveFormat: 'original',
    mergedFormat: markdownCount > htmlCount ? 'markdown' : 'html',
    orderedIds: notes.map((n) => String(n.id)),
  };
}
export function noteExportFormat(settings: NoteExportSettings): NoteBatchExportMode {
  return settings.packaging === 'merged' ? settings.mergedFormat : settings.archiveFormat;
}
const normalizeExportType = (type?: string | null) => (type === 'md' ? 'markdown' : type || 'html');

/** Reconcile the locked scope before merging. Never silently shrink or expand it. */
export function orderNotesForMergedExport(
  notes: BatchExportNote[],
  snapshots: BatchExportNote[],
  orderedIds: string[],
): BatchExportNote[] {
  const byId = new Map(notes.map((n) => [String(n.id), n]));
  const expected = new Map(snapshots.map((n) => [String(n.id), n]));
  if (
    !orderedIds.length ||
    orderedIds.length !== snapshots.length ||
    byId.size !== notes.length ||
    expected.size !== snapshots.length ||
    notes.length !== snapshots.length ||
    new Set(orderedIds).size !== snapshots.length ||
    orderedIds.some(
      (id) =>
        !byId.has(id) ||
        !expected.has(id) ||
        normalizeExportType(byId.get(id)!.type) !== normalizeExportType(expected.get(id)!.type),
    )
  ) {
    throw new Error('NOTE_EXPORT_SCOPE_CHANGED');
  }
  return orderedIds.map((id) => byId.get(id)!);
}
const escapeExportHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c]!,
  );
const markdownTitle = (title: string) => title.replace(/[\r\n]+/g, ' ').replace(/([\\`*_{}\[\]()<>#+.!|~-])/g, '\\$1');

async function mergedHtmlBody(note: BatchExportNote, title: string, keepTitle: boolean) {
  const { inlineMermaidForExport, renderMarkdownForExport } = await import('@/utils/noteExport');
  const raw = String(note.content || '');
  const body =
    normalizeExportType(note.type) === 'markdown'
      ? await renderMarkdownForExport(raw)
      : await inlineMermaidForExport(raw);
  const holder = document.createElement('div');
  holder.innerHTML = body;
  const first = holder.firstElementChild;
  const firstNode = [...holder.childNodes].find(
    (node) => node.nodeType !== 8 && (node.textContent?.trim() || node.nodeType === 1),
  );
  const hasTitle = first === firstNode && first?.tagName === 'H1' && first.textContent?.trim() === title;
  if (!keepTitle) {
    if (hasTitle) first!.remove();
    return hasTitle ? holder.innerHTML : body;
  }
  return `${hasTitle ? '' : `<h1>${escapeExportHtml(title)}</h1>\n`}${body}`;
}

/** All-or-nothing merge. PDF pages are rendered one note at a time to bound canvas memory. */
export async function buildMergedNoteExport(
  notes: BatchExportNote[],
  format: NoteMergedExportFormat,
  options: BuildBatchExportOptions & {
    title?: string;
    showDocumentTitle?: boolean;
    keepNoteTitles?: boolean;
    isCurrent?: () => boolean;
  },
) {
  const { MAX_NOTE_BATCH_ACTION_ITEMS } = await import('@lightnote/shared/resource-selection');
  const failedNoteIds: string[] = [];
  const failed = () => ({ file: null, failedNoteIds });
  if (
    !notes.length ||
    notes.length > MAX_NOTE_BATCH_ACTION_ITEMS ||
    new Set(notes.map((n) => n.id)).size !== notes.length
  ) {
    failedNoteIds.push(...notes.map((n) => n.id));
    return failed();
  }
  const unsupported = notes.filter((n) => !['html', 'markdown'].includes(normalizeExportType(n.type)));
  if (unsupported.length) {
    failedNoteIds.push(...unsupported.map((n) => n.id));
    return failed();
  }
  const title = options.title?.trim() || defaultMergedExportName();
  const keepTitles = options.keepNoteTitles !== false;
  const { buildNoteExportHtml } = await import('@/utils/noteExport');
  const pieces: string[] = [];
  const pdfLib = format === 'pdf' ? await import('pdf-lib') : null;
  const pdf = pdfLib ? await pdfLib.PDFDocument.create() : null;
  pdf?.setTitle(title);
  const checkCurrent = () => {
    if (options.isCurrent && !options.isCurrent()) throw new Error('NOTE_EXPORT_CANCELLED');
  };
  let converter: ReturnType<(typeof import('./noteHtmlToMarkdown'))['createNoteTurndownService']> | undefined;
  for (const [index, note] of notes.entries()) {
    checkCurrent();
    try {
      const noteTitle = String(note.title || '').trim() || options.fallbackTitle;
      if (format === 'markdown') {
        let body = String(note.content || '');
        if (normalizeExportType(note.type) !== 'markdown') {
          converter ||= (await import('./noteHtmlToMarkdown')).createNoteTurndownService();
          // Do not use the legacy converter's catch-and-return-HTML fallback.
          body = converter.turndown(body);
        }
        const { marked } = await import('marked');
        const first = marked.lexer(body).find((token) => token.type !== 'space');
        const holder = document.createElement('div');
        if (first?.type === 'heading' && first.depth === 1) {
          holder.innerHTML = String(await marked.parseInline(first.text));
        }
        const hasTitle = first?.type === 'heading' && first.depth === 1 && holder.textContent?.trim() === noteTitle;
        if (!keepTitles && hasTitle) {
          const offset = body.indexOf(first.raw);
          body = body.slice(0, offset) + body.slice(offset + first.raw.length);
        }
        pieces.push(keepTitles && !hasTitle ? `# ${markdownTitle(noteTitle)}\n\n${body}` : body);
      } else {
        let body = await mergedHtmlBody(note, noteTitle, keepTitles);
        if (index === 0 && options.showDocumentTitle)
          body = `<h1 class="note-export-document-title">${escapeExportHtml(title)}</h1>\n${body}`;
        checkCurrent();
        if (format === 'html') pieces.push(`<section class="note-export-section">${body}</section>`);
        else {
          const generator = options.pdfGenerator || (await import('./htmlToPdf')).generatePdfBlobFromHtml;
          const blob = await generator(buildNoteExportHtml(noteTitle, body, options.lang, false));
          checkCurrent();
          const source = await pdfLib!.PDFDocument.load(await blob.arrayBuffer());
          if (!source.getPageCount()) throw new Error('NOTE_EXPORT_EMPTY_PDF');
          for (const page of await pdf!.copyPages(source, source.getPageIndices())) pdf!.addPage(page);
        }
      }
    } catch (error) {
      checkCurrent();
      failedNoteIds.push(note.id);
      return failed();
    } finally {
      options.onProgress?.(index + 1, notes.length);
    }
  }
  checkCurrent();
  const extension = format === 'markdown' ? 'md' : format;
  const mimeType = { md: 'text/markdown', html: 'text/html', pdf: 'application/pdf' }[extension];
  const content =
    format === 'pdf'
      ? new Blob([new Uint8Array(await pdf!.save())], { type: mimeType })
      : format === 'markdown'
        ? `${options.showDocumentTitle ? `# ${markdownTitle(title)}\n\n---\n\n` : ''}${pieces.join('\n\n---\n\n')}`
        : buildNoteExportHtml(title, pieces.join('\n<hr />\n'), options.lang, false);
  checkCurrent();
  return {
    file: {
      content,
      format: extension,
      mimeType,
      fileName: buildExportFileName(title, options.fallbackTitle, extension),
    },
    failedNoteIds,
  };
}
