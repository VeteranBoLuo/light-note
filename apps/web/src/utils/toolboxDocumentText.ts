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

export interface DocxMarkdownStats {
  paragraphs: number;
  headings: number;
  tables: number;
  links: number;
  images: number;
}

export interface DocxMarkdownResult {
  name: string;
  markdown: string;
  stats: DocxMarkdownStats;
  images?: Array<{ path: string; bytes: Uint8Array; mimeType: string }>;
  skippedImages?: number;
}

function elementChildren(node: Element) {
  return Array.from(node.children);
}

function elementsByLocalName(node: Document | Element, name: string): Element[] {
  return Array.from(node.getElementsByTagNameNS('*', name));
}

function firstByLocalName(node: Document | Element, name: string): Element | null {
  return node.getElementsByTagNameNS('*', name)[0] || null;
}

function relationshipMap(source: string) {
  if (!source) return new Map<string, string>();
  const documentRoot = new DOMParser().parseFromString(source, 'application/xml');
  return new Map(
    Array.from(documentRoot.getElementsByTagNameNS('*', 'Relationship')).map((entry) => [
      entry.getAttribute('Id') || '',
      entry.getAttribute('Target') || '',
    ]),
  );
}

function escapeMarkdownText(value: string) {
  return value.replace(/([\\`*_[\]<>])/gu, '\\$1');
}

function renderRun(run: Element) {
  const text = elementChildren(run)
    .map((entry) => {
      if (entry.localName === 't') return escapeMarkdownText(entry.textContent || '');
      if (entry.localName === 'br' || entry.localName === 'cr') return '  \n';
      if (entry.localName === 'tab') return '\t';
      return '';
    })
    .join('');
  if (!text) return '';
  const properties = firstByLocalName(run, 'rPr');
  const enabled = (name: string) => {
    const property = properties && firstByLocalName(properties, name);
    return Boolean(property && !['0', 'false', 'off'].includes(wordValue(property)));
  };
  const bold = enabled('b');
  const italic = enabled('i');
  let output = text;
  if (bold && italic) output = `***${output}***`;
  else if (bold) output = `**${output}**`;
  else if (italic) output = `*${output}*`;
  return output;
}

function wordValue(element: Element | null, attribute = 'val') {
  return (
    element?.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', attribute) ||
    element?.getAttribute(`w:${attribute}`) ||
    element?.getAttribute(attribute) ||
    ''
  );
}

/** Word numbering is defined outside document.xml. Keep counters per list instance. */
function createListRenderer(numberingXml: string) {
  const root = new DOMParser().parseFromString(numberingXml || '<numbering/>', 'application/xml');
  const abstracts = new Map(
    elementsByLocalName(root, 'abstractNum').map((node) => [wordValue(node, 'abstractNumId'), node]),
  );
  const instances = new Map(elementsByLocalName(root, 'num').map((node) => [wordValue(node, 'numId'), node]));
  const counters = new Map<string, Map<number, number>>();
  return (properties: Element, text: string) => {
    const numId = wordValue(firstByLocalName(properties, 'numId'));
    if (numId === '0') return text;
    const level = Math.min(8, Math.max(0, Number(wordValue(firstByLocalName(properties, 'ilvl'))) || 0));
    const instance = instances.get(numId);
    const abstract = instance && abstracts.get(wordValue(firstByLocalName(instance, 'abstractNumId')));
    const override =
      instance &&
      elementChildren(instance).find(
        (node) => node.localName === 'lvlOverride' && Number(wordValue(node, 'ilvl')) === level,
      );
    const definition =
      (override && firstByLocalName(override, 'lvl')) ||
      (abstract &&
        elementChildren(abstract).find(
          (node) => node.localName === 'lvl' && Number(wordValue(node, 'ilvl')) === level,
        ));
    const format = definition ? wordValue(firstByLocalName(definition, 'numFmt')) : 'bullet';
    const startText =
      (override && wordValue(firstByLocalName(override, 'startOverride'))) ||
      (definition && wordValue(firstByLocalName(definition, 'start')));
    const start = startText === '' || !Number.isFinite(Number(startText)) ? 1 : Math.max(0, Number(startText));
    const listCounters = counters.get(numId) || new Map<number, number>();
    const count = (listCounters.get(level) ?? start - 1) + 1;
    listCounters.set(level, count);
    for (const key of listCounters.keys()) if (key > level) listCounters.delete(key);
    counters.set(numId, listCounters);
    const marker = format === 'none' ? '' : format === 'bullet' ? '- ' : `${count}. `;
    const indent = '    '.repeat(level);
    return `${indent}${marker}${text.replace(/\n/g, `\n${indent}${' '.repeat(marker.length)}`)}`;
  };
}

type ListRenderer = ReturnType<typeof createListRenderer>;

function renderParagraph(
  paragraph: Element,
  relationships: Map<string, string>,
  renderList: ListRenderer,
  imagePaths: Map<string, string>,
) {
  const imagesIn = (node: Element) =>
    [...elementsByLocalName(node, 'blip'), ...elementsByLocalName(node, 'imagedata')]
      .map((image) => {
        const id = image.getAttributeNS(
          'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
          image.localName === 'blip' ? 'embed' : 'id',
        );
        const path = imagePaths.get(id || '');
        return path ? `\n\n![Image](${path})\n\n` : '';
      })
      .join('');
  let output = '';
  for (const child of elementChildren(paragraph)) {
    if (child.localName === 'r') output += renderRun(child) + imagesIn(child);
    else if (child.localName === 'hyperlink') {
      const text = elementChildren(child)
        .filter((entry) => entry.localName === 'r')
        .map(renderRun)
        .join('');
      const relationshipId = child.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        'id',
      );
      const target = relationships.get(relationshipId || '');
      output += target ? `[${text || target}](${target})` : text;
    }
  }
  const properties = firstByLocalName(paragraph, 'pPr');
  const style = properties ? firstByLocalName(properties, 'pStyle') : null;
  const styleValue =
    style?.getAttributeNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'val') ||
    style?.getAttribute('w:val') ||
    style?.getAttribute('val') ||
    '';
  const headingMatch = /^(?:Heading|标题)\s*([1-6])$/iu.exec(styleValue);
  const listProperties = properties && firstByLocalName(properties, 'numPr');
  if (headingMatch) return `${'#'.repeat(Number(headingMatch[1]))} ${output.trim()}`;
  if (/^Title$/iu.test(styleValue)) return `# ${output.trim()}`;
  if (listProperties) return renderList(listProperties, output.trim());
  return output.trim();
}

function renderTable(
  table: Element,
  relationships: Map<string, string>,
  renderList: ListRenderer,
  imagePaths: Map<string, string>,
) {
  const rows = elementsByLocalName(table, 'tr').map((row) =>
    elementsByLocalName(row, 'tc').map((cell) =>
      elementsByLocalName(cell, 'p')
        .map((paragraph) => renderParagraph(paragraph, relationships, renderList, imagePaths).replace(/ *\n/g, '<br>'))
        .filter(Boolean)
        .join('<br>')
        .replace(/\|/gu, '\\|'),
    ),
  );
  if (!rows.length) return '';
  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => Array.from({ length: width }, (_, index) => row[index] || ''));
  return [
    `| ${normalized[0]!.join(' | ')} |`,
    `| ${normalized[0]!.map(() => '---').join(' | ')} |`,
    ...normalized.slice(1).map((row) => `| ${row.join(' | ')} |`),
  ].join('\n');
}

export function convertDocxXmlToMarkdown(
  documentXml: string,
  relationshipsXml = '',
  numberingXml = '',
  imagePaths = new Map<string, string>(),
) {
  const documentRoot = new DOMParser().parseFromString(documentXml, 'application/xml');
  if (documentRoot.getElementsByTagName('parsererror').length) throw new Error('INVALID_DOCX');
  const body = firstByLocalName(documentRoot, 'body');
  if (!body) throw new Error('INVALID_DOCX');
  const relationships = relationshipMap(relationshipsXml);
  const renderList = createListRenderer(numberingXml);
  const blocks: string[] = [];
  const stats: DocxMarkdownStats = {
    paragraphs: 0,
    headings: 0,
    tables: 0,
    links: elementsByLocalName(documentRoot, 'hyperlink').length,
    images: elementsByLocalName(documentRoot, 'drawing').length + elementsByLocalName(documentRoot, 'pict').length,
  };
  for (const child of elementChildren(body)) {
    if (child.localName === 'p') {
      const paragraph = renderParagraph(child, relationships, renderList, imagePaths);
      if (!paragraph) continue;
      stats.paragraphs += 1;
      if (/^#{1,6}\s/u.test(paragraph)) stats.headings += 1;
      blocks.push(paragraph);
    } else if (child.localName === 'tbl') {
      const table = renderTable(child, relationships, renderList, imagePaths);
      if (table) {
        stats.tables += 1;
        blocks.push(table);
      }
    }
  }
  return {
    markdown: blocks
      .join('\n\n')
      .replace(/\n{3,}/gu, '\n\n')
      .trim(),
    stats,
  };
}

// Stop inflation at a bounded size, including when a small DOCX contains highly compressed entries.
function readZipEntry(entry: import('jszip').JSZipObject, limit: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0,
      failed = false;
    const stream = (
      entry as import('jszip').JSZipObject & {
        internalStream(type: 'uint8array'): import('jszip').JSZipStreamHelper<Uint8Array>;
      }
    ).internalStream('uint8array');
    stream
      .on('data', (chunk) => {
        size += chunk.length;
        if (size > limit) {
          failed = true;
          stream.pause();
          reject(new Error('TOO_LARGE'));
          return;
        }
        chunks.push(chunk);
      })
      .on('error', reject)
      .on('end', () => {
        if (failed) return;
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(bytes);
      })
      .resume();
  });
}

export async function convertDocxToMarkdown(file: File): Promise<DocxMarkdownResult> {
  if (file.size > 20 * 1024 * 1024) throw new Error('TOO_LARGE');
  const JSZip = (await import('jszip')).default;
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const documentFile = archive.file('word/document.xml');
  if (!documentFile) throw new Error('INVALID_DOCX');
  const readXml = async (path: string, maxBytes = 2 * 1024 * 1024) => {
    const entry = archive.file(path);
    return entry ? new TextDecoder().decode(await readZipEntry(entry, maxBytes)) : '';
  };
  const documentXml = await readXml('word/document.xml', 20 * 1024 * 1024);
  const relationshipsXml = await readXml('word/_rels/document.xml.rels');
  const numberingXml = await readXml('word/numbering.xml');
  const relationships = new DOMParser().parseFromString(relationshipsXml, 'application/xml');
  const documentRoot = new DOMParser().parseFromString(documentXml, 'application/xml');
  const referenced = new Set(
    [...elementsByLocalName(documentRoot, 'blip'), ...elementsByLocalName(documentRoot, 'imagedata')].map((image) =>
      image.getAttributeNS(
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
        image.localName === 'blip' ? 'embed' : 'id',
      ),
    ),
  );
  const images: NonNullable<DocxMarkdownResult['images']> = [];
  const imagePaths = new Map<string, string>();
  let imageBytes = 0,
    skippedImages = 0;
  for (const relationship of elementsByLocalName(relationships, 'Relationship')) {
    const id = relationship.getAttribute('Id') || '';
    if (!referenced.has(id)) continue;
    const target = relationship.getAttribute('Target') || '';
    // Never fetch linked images or accept traversals, active formats, headers or macros.
    if (
      relationship.getAttribute('TargetMode') === 'External' ||
      !/^media\/[^/\\]+\.(png|jpe?g|webp)$/i.test(target) ||
      images.length >= 100
    ) {
      skippedImages++;
      continue;
    }
    const entry = archive.file(`word/${target}`);
    if (!entry) {
      skippedImages++;
      continue;
    }
    try {
      const bytes = await readZipEntry(entry, Math.min(10 * 1024 * 1024, 24 * 1024 * 1024 - imageBytes));
      const signature = Array.from(bytes.slice(0, 12));
      const mimeType =
        signature.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10'
          ? 'image/png'
          : signature[0] === 255 && signature[1] === 216 && signature[2] === 255
            ? 'image/jpeg'
            : String.fromCharCode(...signature.slice(0, 4)) === 'RIFF' &&
                String.fromCharCode(...signature.slice(8, 12)) === 'WEBP'
              ? 'image/webp'
              : '';
      if (!mimeType) {
        skippedImages++;
        continue;
      }
      const path = `assets/image-${images.length + 1}.${mimeType === 'image/jpeg' ? 'jpg' : mimeType.split('/')[1]}`;
      images.push({ path, bytes, mimeType });
      imageBytes += bytes.length;
      imagePaths.set(id, path);
    } catch {
      skippedImages++;
    }
  }
  const converted = convertDocxXmlToMarkdown(documentXml, relationshipsXml, numberingXml, imagePaths);
  return { name: file.name, ...converted, images, skippedImages };
}
