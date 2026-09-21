import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import { marked } from 'marked';
import TurndownService from 'turndown';
import gfm from 'turndown-plugin-gfm';
import ExcelJS from 'exceljs';
import { parseResourceHref } from '@lightnote/shared';
import { sanitizeNoteHtml } from '../noteHtmlSanitizer.js';
import { buildNoteExportHtml } from '@lightnote/shared/note-export-document';
import { splitExportText, resolveDataExportNoteFormat } from '@lightnote/shared/data-export';
import { hash, exportError, ensureSpace } from './storage.js';
import { imageBytes, imageExtension } from './downloads.js';
const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
turndown.use(gfm.gfm);
const relative = (from, to) =>
  path.posix.relative(path.posix.dirname(from), to).split('/').map(encodeURIComponent).join('/');
export async function renderNote(row, item, ctx) {
  if (row.type === 'drawing') {
    JSON.parse(row.content);
    return { content: row.content, warnings: [] };
  }
  if (!['html', 'markdown', 'md'].includes(row.type)) throw exportError('DATA_EXPORT_CONVERSION_FAILED');
  const html = ['markdown', 'md'].includes(row.type) ? marked.parse(row.content || '') : String(row.content || '');
  const $ = load(html, null, false),
    warnings = [];
  // Unsupported active embeds are reported rather than silently disappearing.
  if ($('iframe,video,audio,object,embed,canvas,svg').length) throw exportError('DATA_EXPORT_CONVERSION_FAILED');
  const imageFailures = [];
  let imageIndex = 0;
  for (const el of $('img').toArray()) {
    imageIndex++;
    const img = $(el),
      source = img.attr('src') || '';
    img.removeAttr('srcset');
    if (!ctx.options.includeImages) {
      img.replaceWith($('<span>').text(img.attr('alt') || ''));
      continue;
    }
    try {
      const cacheKey = hash(source);
      let asset = ctx.images.get(cacheKey);
      if (!asset) {
        if ((ctx.imageAttempts = (ctx.imageAttempts || 0) + 1) > 2000) throw exportError('DATA_EXPORT_IMAGE_LIMIT');
        const bytes = await ctx.readImage(
          source,
          ctx.owner,
          ctx.db,
          AbortSignal.any([ctx.signal, AbortSignal.timeout(30000)]),
        );
        ctx.imageBytes += bytes.length;
        if (ctx.imageBytes > 512 * 1024 * 1024) throw exportError('DATA_EXPORT_IMAGE_LIMIT');
        asset = '笔记/图片/' + hash(bytes) + imageExtension(bytes);
        await ensureSpace(bytes.length * 2);
        await fs.mkdir(path.join(ctx.directory, '笔记/图片'), { recursive: true, mode: 0o700 });
        await fs.writeFile(path.join(ctx.directory, asset), bytes, { mode: 0o600 });
        ctx.images.set(cacheKey, asset);
      }
      img.attr('src', relative(item.path, asset));
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      warnings.push('DATA_EXPORT_IMAGE_FAILED');
      if (source.startsWith('/')) img.attr('src', new URL(source, 'https://boluo66.top').href);
      imageFailures.push(`图片 ${imageIndex}${img.attr('alt') ? '（' + img.attr('alt') + '）' : ''}`);
    }
  }
  $('a[href]').each((_, el) => {
    const a = $(el);
    try {
      const u = new URL(a.attr('href'), 'https://boluo66.top');
      if (u.hostname !== 'boluo66.top') return;
      const ref = parseResourceHref(u.pathname + u.search);
      const dest = ref?.type === 'note' && ctx.paths.get(ref.id);
      if (dest) a.attr('href', relative(item.path, dest) + u.hash);
      else if (!a.attr('href').startsWith('#')) a.attr('href', u.href);
    } catch {
      /* non-web links pass through the sanitizer */
    }
  });
  const first = $.root().children().first();
  const sameHeading = first.is('h1') && first.text().trim() === String(row.title || '').trim();
  const body = sanitizeNoteHtml($.html()).html;
  if (resolveDataExportNoteFormat(row.type, ctx.options.noteFormat) === 'html')
    return {
      content: buildNoteExportHtml(
        row.title || 'Untitled',
        sameHeading
          ? body
          : `<h1>${$('<span>')
              .text(row.title || 'Untitled')
              .html()}</h1>\n${body}`,
      ),
      warnings,
      imageFailures,
    };
  const markdown = turndown.turndown(body);
  return {
    content: sameHeading ? markdown : `# ${String(row.title || 'Untitled').replace(/\n/g, ' ')}\n\n${markdown}`,
    warnings,
    imageFailures,
  };
}
export const plainText = (html) => {
  const $ = load(String(html || ''), null, false);
  $('br').replaceWith('\n');
  $('p,div,li,h1,h2,h3,h4,pre,blockquote').append('\n');
  return $.root()
    .text()
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};
export function createBookmarkWorkbook(filename) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ filename, useStyles: true, useSharedStrings: false });
  const sheet = workbook.addWorksheet('书签', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    ['标题', 28],
    ['网址', 45],
    ['描述', 45],
    ['网页正文', 70],
    ['标签', 24],
    ['收藏时间', 22],
  ].map(([header, width]) => ({ header, width }));
  sheet.autoFilter = 'A1:F1';
  sheet.getRow(1).font = { bold: true };
  let longSheet,
    index = 0,
    longRow = 1;
  return {
    append(row) {
      index++;
      const values = [
        row.title || '',
        row.url || '',
        row.description || '',
        row.content ? plainText(row.content) : '未保存正文',
        row.tags || '',
        row.create_time instanceof Date ? row.create_time.toISOString() : String(row.create_time || ''),
      ];
      // All textual fields obey Excel's limit, not only archived bodies.
      const cells = values.map((value, col) => {
        const chunks = splitExportText(value);
        if (chunks.length === 1) return value;
        if (!longSheet) {
          longSheet = workbook.addWorksheet('长正文', { views: [{ state: 'frozen', ySplit: 1 }] });
          longSheet.columns = [
            { header: '书签编号', width: 14 },
            { header: '字段', width: 16 },
            { header: '段序', width: 10 },
            { header: '内容', width: 100 },
          ];
          longSheet.getRow(1).commit();
        }
        const start = longRow + 1;
        chunks.forEach((chunk, i) => {
          longSheet.addRow([index, sheet.columns[col].header, i + 1, chunk]).commit();
          longRow++;
        });
        return { text: String(value).slice(0, 200) + '…（完整内容见长正文）', hyperlink: `#'长正文'!A${start}` };
      });
      if (typeof cells[1] === 'string' && /^https?:\/\//i.test(row.url || ''))
        cells[1] = { text: cells[1], hyperlink: row.url };
      const r = sheet.addRow(cells);
      r.alignment = { vertical: 'top', wrapText: true };
      r.height = 60;
      r.commit();
    },
    async commit() {
      sheet.commit();
      longSheet?.commit();
      await workbook.commit();
    },
  };
}
export const defaultReadImage = imageBytes;
