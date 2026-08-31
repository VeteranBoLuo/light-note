import type { ProductionMarkupBody } from '@lightnote/shared/production-project-protocol';
import { buildExportFileName } from '@/utils/fileDelivery';

export interface ProductionProjectExportFile {
  fileName: string;
  mimeType: string;
  blob: Blob;
}

export interface ProductionTextBlock {
  kind: 'heading' | 'paragraph' | 'list';
  text: string;
  level?: number;
}

export const OOXML_TIMESTAMP = '2000-01-01T00:00:00Z';
export const OOXML_ZIP_DATE = new Date(2000, 0, 1, 0, 0, 0, 0);

export function productionProjectFileName(title: string, fallback: string, extension: string) {
  return buildExportFileName(title, fallback, extension);
}

export function escapeXml(value: unknown) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, '')
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

function decodeHtmlEntities(value: string) {
  if (typeof document !== 'undefined') {
    const holder = document.createElement('textarea');
    holder.innerHTML = value;
    return holder.value;
  }
  return value
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'");
}

function stripMarkdownInline(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/\*\*([^*]+)\*\*/gu, '$1')
    .replace(/__([^_]+)__/gu, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/gu, '$1')
    .replace(/(?<!_)_([^_]+)_(?!_)/gu, '$1')
    .replace(/~~([^~]+)~~/gu, '$1')
    .replace(/\\([\\`*_[\]{}()#+.!>-])/gu, '$1')
    .trim();
}

function markdownBlocks(value: string): ProductionTextBlock[] {
  const blocks: ProductionTextBlock[] = [];
  let inFence = false;
  for (const rawLine of String(value || '')
    .replace(/\r\n?/gu, '\n')
    .split('\n')) {
    if (/^\s*```/u.test(rawLine)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      blocks.push({ kind: 'paragraph', text: rawLine });
      continue;
    }
    const heading = rawLine.match(/^\s{0,3}(#{1,6})\s+(.+)$/u);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, text: stripMarkdownInline(heading[2]) });
      continue;
    }
    const list = rawLine.match(/^\s*(?:[-+*]|\d+[.)])\s+(.+)$/u);
    if (list) {
      blocks.push({ kind: 'list', text: stripMarkdownInline(list[1].replace(/^\[[ xX]\]\s*/u, '')) });
      continue;
    }
    const text = stripMarkdownInline(rawLine.replace(/^\s*>\s?/u, ''));
    if (text) blocks.push({ kind: 'paragraph', text });
  }
  return blocks;
}

function htmlBlocks(value: string): ProductionTextBlock[] {
  if (typeof DOMParser === 'undefined') {
    const text = decodeHtmlEntities(
      String(value || '')
        .replace(/<br\s*\/?\s*>/giu, '\n')
        .replace(/<\/\s*(?:p|div|h[1-6]|li|blockquote|pre)\s*>/giu, '\n')
        .replace(/<[^>]+>/gu, ''),
    );
    return text
      .split(/\n+/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((text) => ({ kind: 'paragraph' as const, text }));
  }
  const parsed = new DOMParser().parseFromString(`<body>${String(value || '')}</body>`, 'text/html');
  const nodes = parsed.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre');
  const blocks: ProductionTextBlock[] = [];
  nodes.forEach((node) => {
    const text = String(node.textContent || '').trim();
    if (!text) return;
    const tag = node.tagName.toLowerCase();
    if (/^h[1-6]$/u.test(tag)) blocks.push({ kind: 'heading', level: Number(tag.slice(1)), text });
    else if (tag === 'li') blocks.push({ kind: 'list', text });
    else blocks.push({ kind: 'paragraph', text });
  });
  if (!blocks.length) {
    const text = String(parsed.body.textContent || '').trim();
    if (text) blocks.push({ kind: 'paragraph', text });
  }
  return blocks;
}

export function markupBodyToTextBlocks(body: ProductionMarkupBody) {
  return body.format === 'html' ? htmlBlocks(body.value) : markdownBlocks(body.value);
}

export function markupBodyToPlainText(body: ProductionMarkupBody) {
  return markupBodyToTextBlocks(body)
    .map((block) => block.text)
    .join('\n');
}

export function addDeterministicZipFile(
  zip: import('jszip'),
  path: string,
  content: string | Blob | Uint8Array | ArrayBuffer,
) {
  zip.file(path, content, { date: OOXML_ZIP_DATE, createFolders: true });
}

export function ooxmlCoreProperties(title: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(title)}</dc:title><dc:creator>Light Note</dc:creator><cp:lastModifiedBy>Light Note</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${OOXML_TIMESTAMP}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${OOXML_TIMESTAMP}</dcterms:modified></cp:coreProperties>`;
}
