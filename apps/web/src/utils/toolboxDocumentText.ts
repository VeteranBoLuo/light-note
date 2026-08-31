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
  const text = elementsByLocalName(run, 't')
    .map((entry) => entry.textContent || '')
    .join('');
  if (!text) return '';
  const properties = firstByLocalName(run, 'rPr');
  const bold = Boolean(properties && firstByLocalName(properties, 'b'));
  const italic = Boolean(properties && firstByLocalName(properties, 'i'));
  let output = escapeMarkdownText(text);
  if (bold && italic) output = `***${output}***`;
  else if (bold) output = `**${output}**`;
  else if (italic) output = `*${output}*`;
  return output;
}

function renderParagraph(paragraph: Element, relationships: Map<string, string>) {
  let output = '';
  for (const child of elementChildren(paragraph)) {
    if (child.localName === 'r') output += renderRun(child);
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
  const isList = Boolean(properties && firstByLocalName(properties, 'numPr'));
  if (headingMatch) return `${'#'.repeat(Number(headingMatch[1]))} ${output.trim()}`;
  if (/^Title$/iu.test(styleValue)) return `# ${output.trim()}`;
  if (isList) return `- ${output.trim()}`;
  return output.trim();
}

function renderTable(table: Element, relationships: Map<string, string>) {
  const rows = elementsByLocalName(table, 'tr').map((row) =>
    elementsByLocalName(row, 'tc').map((cell) =>
      elementsByLocalName(cell, 'p')
        .map((paragraph) => renderParagraph(paragraph, relationships))
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

export function convertDocxXmlToMarkdown(documentXml: string, relationshipsXml = '') {
  const documentRoot = new DOMParser().parseFromString(documentXml, 'application/xml');
  if (documentRoot.getElementsByTagName('parsererror').length) throw new Error('INVALID_DOCX');
  const body = firstByLocalName(documentRoot, 'body');
  if (!body) throw new Error('INVALID_DOCX');
  const relationships = relationshipMap(relationshipsXml);
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
      const paragraph = renderParagraph(child, relationships);
      if (!paragraph) continue;
      stats.paragraphs += 1;
      if (/^#{1,6}\s/u.test(paragraph)) stats.headings += 1;
      blocks.push(paragraph);
    } else if (child.localName === 'tbl') {
      const table = renderTable(child, relationships);
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

export async function convertDocxToMarkdown(file: File): Promise<DocxMarkdownResult> {
  if (file.size > 20 * 1024 * 1024) throw new Error('TOO_LARGE');
  const JSZip = (await import('jszip')).default;
  const archive = await JSZip.loadAsync(await file.arrayBuffer());
  const documentFile = archive.file('word/document.xml');
  if (!documentFile) throw new Error('INVALID_DOCX');
  const relationshipsFile = archive.file('word/_rels/document.xml.rels');
  const converted = convertDocxXmlToMarkdown(
    await documentFile.async('string'),
    relationshipsFile ? await relationshipsFile.async('string') : '',
  );
  return { name: file.name, ...converted };
}
