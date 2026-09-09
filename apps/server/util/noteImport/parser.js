import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import yauzl from 'yauzl';
import mammoth from 'mammoth';
import { load } from 'cheerio';
import { marked } from 'marked';
import { NOTE_IMPORT_LIMITS as LIMIT } from '@lightnote/shared/note-transfer';
import { sanitizeNoteHtml } from '../noteHtmlSanitizer.js';
import { safeImageSize } from '../safeImageSize.js';
import { NOTE_IMAGE_MAX_BYTES, NOTE_IMAGE_MAX_PIXELS } from '../noteImageUpload.js';
import { importError, writeJson } from './storage.js';

export function safeArchivePath(name) {
  const value = String(name).replaceAll('\\', '/');
  if (
    !value ||
    value.startsWith('/') ||
    /^[a-z]:/i.test(value) ||
    value.includes('\0') ||
    value.split('/').includes('..')
  )
    throw importError('NOTE_IMPORT_UNSAFE_ARCHIVE');
  return value.replace(/^\.\//, '').normalize('NFC');
}
export async function readZip(buffer, budget) {
  const zip = await new Promise((resolve, reject) =>
    yauzl.fromBuffer(buffer, { lazyEntries: true, decodeStrings: true, validateEntrySizes: true }, (e, z) =>
      e ? reject(e) : resolve(z),
    ),
  );
  const files = new Map();
  return new Promise((resolve, reject) => {
    const fail = (error) => {
      zip.close();
      reject(error);
    };
    zip.on('error', fail);
    zip.on('end', () => resolve(files));
    zip.on('entry', async (entry) => {
      try {
        const name = safeArchivePath(entry.fileName);
        if (
          ++budget.entries > LIMIT.entries ||
          entry.generalPurposeBitFlag & 1 ||
          ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000
        )
          throw importError('NOTE_IMPORT_UNSAFE_ARCHIVE');
        if (name.endsWith('/')) {
          zip.readEntry();
          return;
        }
        if (files.has(name)) throw importError('NOTE_IMPORT_DUPLICATE_PATH');
        budget.bytes += entry.uncompressedSize;
        if (budget.bytes > LIMIT.expandedBytes) throw importError('NOTE_IMPORT_EXPANDED_LIMIT');
        const stream = await new Promise((r, j) => zip.openReadStream(entry, (e, s) => (e ? j(e) : r(s))));
        const chunks = [];
        let size = 0;
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > entry.uncompressedSize || size > LIMIT.expandedBytes)
            throw importError('NOTE_IMPORT_EXPANDED_LIMIT');
          chunks.push(chunk);
        }
        files.set(name, Buffer.concat(chunks));
        zip.readEntry();
      } catch (e) {
        fail(e);
      }
    });
    zip.readEntry();
  });
}
function decode(buffer) {
  try {
    const encoding =
      buffer[0] === 0xff && buffer[1] === 0xfe
        ? 'utf-16le'
        : buffer[0] === 0xfe && buffer[1] === 0xff
          ? 'utf-16be'
          : 'utf-8';
    return new TextDecoder(encoding, { fatal: true }).decode(buffer);
  } catch {
    throw importError('NOTE_IMPORT_ENCODING');
  }
}
export async function parseImportFiles(directory) {
  const uploads = await fs.readdir(path.join(directory, 'uploads'));
  const budget = { bytes: 0, entries: 0 };
  const groups = [];
  for (const upload of uploads.filter((n) => n.endsWith('.json')).sort()) {
    const info = JSON.parse(await fs.readFile(path.join(directory, 'uploads', upload), 'utf8'));
    const buffer = await fs.readFile(path.join(directory, 'uploads', info.key));
    if (path.extname(info.name).toLowerCase() === '.zip') groups.push(await readZip(buffer, budget));
    else {
      budget.bytes += buffer.length;
      budget.entries++;
      groups.push(new Map([[safeArchivePath(info.name), buffer]]));
    }
  }
  const documents = groups.flatMap((files) =>
    [...files]
      .filter(([name]) => /\.(md|markdown|html?|docx)$/i.test(name))
      .map(([name, buffer]) => ({ name, buffer, files })),
  );
  if (
    !documents.length ||
    documents.length > LIMIT.documents ||
    budget.bytes > LIMIT.expandedBytes ||
    budget.entries > LIMIT.entries
  )
    throw importError('NOTE_IMPORT_DOCUMENT_LIMIT');
  const items = [];
  for (const [position, doc] of documents.entries()) {
    const id = createHash('sha256')
      .update(`${path.basename(directory)}:${position}:${doc.name}`)
      .digest('hex')
      .slice(0, 32);
    const item = {
      id: `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`,
      title:
        path.posix
          .basename(doc.name)
          .replace(/\.[^.]+$/, '')
          .slice(0, 255) || 'Untitled',
      sourceName: doc.name.slice(0, 1024),
      type: /\.(md|markdown)$/i.test(doc.name) ? 'markdown' : 'html',
      warnings: [],
      images: [],
      position,
    };
    const warn = (code) => {
      if (!item.warnings.includes(code)) item.warnings.push(code);
    };
    const image = async (buffer) => {
      try {
        if (buffer.length > NOTE_IMAGE_MAX_BYTES) throw new Error();
        const dimensions = safeImageSize(buffer);
        const extension = { jpg: 'jpg', png: 'png', gif: 'gif', webp: 'webp' }[dimensions.type];
        if (
          !extension ||
          !dimensions.width ||
          !dimensions.height ||
          dimensions.width * dimensions.height > NOTE_IMAGE_MAX_PIXELS
        )
          throw new Error();
        const key = `${createHash('sha256').update(buffer).digest('hex')}.${extension}`;
        await fs.mkdir(path.join(directory, 'assets'), { recursive: true, mode: 0o700 });
        await fs.writeFile(path.join(directory, 'assets', key), buffer, { mode: 0o600 });
        if (!item.images.includes(key)) item.images.push(key);
        return `https://note-import.invalid/${key}`;
      } catch {
        warn('unsupported_image');
        return '';
      }
    };
    const resolveImage = async (src) => {
      if (/^https?:\/\//i.test(src)) return src;
      if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src)) return image(Buffer.from(src.split(',')[1], 'base64'));
      let target;
      try {
        const decoded = decodeURIComponent(src.split(/[?#]/)[0]);
        if (/^[a-z][a-z\d+.-]*:/i.test(decoded) || decoded.startsWith('/')) throw new Error();
        target = safeArchivePath(path.posix.normalize(path.posix.join(path.posix.dirname(doc.name), decoded)));
      } catch {
        warn('missing_image');
        return '';
      }
      const bytes = doc.files.get(target);
      if (!bytes) {
        warn('missing_image');
        return '';
      }
      return image(bytes);
    };
    try {
      let content;
      if (/\.docx$/i.test(doc.name)) {
        await readZip(doc.buffer, budget); // Validate DOCX container before Mammoth reads it.
        const converted = await mammoth.convertToHtml(
          { buffer: doc.buffer },
          {
            externalFileAccess: false,
            includeEmbeddedStyleMap: false,
            convertImage: mammoth.images.imgElement(async (img) => ({ src: await image(await img.read()) })),
          },
        );
        content = converted.value;
        warn('format_simplified');
      } else content = decode(doc.buffer);
      if (content.length > LIMIT.contentLength * 6) throw importError('NOTE_IMPORT_CONTENT_LIMIT');
      if (item.type === 'html') {
        const $ = load(content);
        // Never preview active original HTML or styles from a full exported document.
        if ($('script,style,iframe,object,embed,base,link,meta').length) warn('format_simplified');
        $('script,style,iframe,object,embed,base,link,meta').remove();
        for (const element of $('img').toArray()) {
          const src = await resolveImage($(element).attr('src') || '');
          if (src) $(element).attr('src', src);
          else $(element).replaceWith($('<span>').text(`[${$(element).attr('alt') || 'Image unavailable'}]`));
        }
        $('a[href]').each((_, e) => {
          const href = $(e).attr('href');
          if (href && !/^(https?:|mailto:|tel:|#)/i.test(href)) warn('local_link');
        });
        const result = sanitizeNoteHtml($('body').html() || '');
        content = result.html;
        if (result.report.changed) warn('format_simplified');
      } else {
        // Use Markdown token offsets via raw substrings, never replace code fence contents.
        const tokens = marked.lexer(content);
        const replacements = [];
        const visit = async (list, base = 0) => {
          let cursor = base;
          for (const token of list) {
            const index = content.indexOf(token.raw, cursor);
            if (index < 0) continue;
            cursor = index + token.raw.length;
            if (token.type === 'image') {
              const src = await resolveImage(token.href);
              replacements.push({
                start: index,
                end: cursor,
                value: src
                  ? `![${String(token.text || '').replaceAll(']', '\\]')}](${src})`
                  : `[${token.text || 'Image unavailable'}]`,
              });
            } else if (token.type === 'html') {
              // Raw HTML images are handled without parsing or rewriting surrounding Markdown.
              const $ = load(token.raw, {}, false);
              for (const e of $('img').toArray()) {
                const src = await resolveImage($(e).attr('src') || '');
                if (src) $(e).attr('src', src);
                else $(e).replaceWith('[Image unavailable]');
              }
              if ($('img').length || /<img\b/i.test(token.raw))
                replacements.push({ start: index, end: cursor, value: $.html() });
            } else {
              if (token.type === 'link' && !/^(https?:|mailto:|tel:|#)/i.test(token.href)) warn('local_link');
              if (token.tokens) await visit(token.tokens, index);
              if (token.items) await visit(token.items, index);
              if (token.header) for (const cell of token.header) await visit(cell.tokens || [], index);
              if (token.rows)
                for (const row of token.rows) for (const cell of row) await visit(cell.tokens || [], index);
            }
          }
        };
        await visit(tokens);
        for (const r of replacements.sort((a, b) => b.start - a.start))
          content = content.slice(0, r.start) + r.value + content.slice(r.end);
      }
      if (content.length > LIMIT.contentLength) throw importError('NOTE_IMPORT_CONTENT_LIMIT');
      if (!content.trim()) warn('empty_document');
      await writeJson(path.join(directory, `${item.id}.json`), { content, images: item.images });
    } catch (e) {
      item.errorCode = String(e.code || 'NOTE_IMPORT_PARSE_FAILED').slice(0, 80);
    }
    items.push(item);
  }
  await writeJson(path.join(directory, 'parsed.json'), items);
  return items;
}
