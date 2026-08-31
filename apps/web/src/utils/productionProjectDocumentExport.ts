import type { ProductionDocumentContentV1 } from '@lightnote/shared/production-project-protocol';
import {
  addDeterministicZipFile,
  escapeXml,
  markupBodyToTextBlocks,
  ooxmlCoreProperties,
  productionProjectFileName,
  type ProductionProjectExportFile,
} from '@/utils/productionProjectExportHelpers';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function assertDocumentSnapshot(content: ProductionDocumentContentV1) {
  if (content?.type !== 'document' || content.schemaVersion !== 1) {
    throw new Error('Unsupported production document snapshot');
  }
  return content;
}

export async function buildProductionDocumentMarkdown(content: ProductionDocumentContentV1, title: string) {
  const snapshot = assertDocumentSnapshot(content);
  if (snapshot.body.format === 'markdown') {
    const body = snapshot.body.value;
    return /^\s*#\s/u.test(body) ? body : `# ${String(title || '').trim() || 'Untitled document'}\n\n${body}`;
  }
  const { createNoteTurndownService } = await import('@/utils/noteHtmlToMarkdown');
  const markdown = createNoteTurndownService().turndown(snapshot.body.value || '');
  return `# ${String(title || '').trim() || 'Untitled document'}${markdown ? `\n\n${markdown}` : ''}`;
}

export async function buildProductionDocumentHtml(content: ProductionDocumentContentV1, title: string, lang = 'zh-CN') {
  const snapshot = assertDocumentSnapshot(content);
  const { buildNoteExportHtml, inlineMermaidForExport, renderMarkdownForExport } = await import('@/utils/noteExport');
  let body: string;
  if (snapshot.body.format === 'markdown') {
    body = await renderMarkdownForExport(snapshot.body.value);
  } else {
    const dompurify = (await import('dompurify')).default;
    body = await inlineMermaidForExport(dompurify.sanitize(snapshot.body.value));
  }
  return buildNoteExportHtml(String(title || '').trim() || 'Untitled document', body, lang);
}

export async function exportProductionDocumentMarkdown(
  content: ProductionDocumentContentV1,
  title: string,
): Promise<ProductionProjectExportFile> {
  const markdown = await buildProductionDocumentMarkdown(content, title);
  return {
    fileName: productionProjectFileName(title, 'untitled-document', 'md'),
    mimeType: 'text/markdown;charset=utf-8',
    blob: new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
  };
}

export async function exportProductionDocumentHtml(
  content: ProductionDocumentContentV1,
  title: string,
  lang = 'zh-CN',
): Promise<ProductionProjectExportFile> {
  const html = await buildProductionDocumentHtml(content, title, lang);
  return {
    fileName: productionProjectFileName(title, 'untitled-document', 'html'),
    mimeType: 'text/html;charset=utf-8',
    blob: new Blob([html], { type: 'text/html;charset=utf-8' }),
  };
}

export async function exportProductionDocumentPdf(
  content: ProductionDocumentContentV1,
  title: string,
  options: {
    lang?: string;
    pdfGenerator?: (html: string, options?: Record<string, unknown>) => Promise<Blob>;
  } = {},
): Promise<ProductionProjectExportFile> {
  const snapshot = assertDocumentSnapshot(content);
  const html = await buildProductionDocumentHtml(snapshot, title, options.lang);
  const pdfGenerator = options.pdfGenerator || (await import('@/utils/htmlToPdf')).generatePdfBlobFromHtml;
  const format = snapshot.page.size === 'auto' ? 'a4' : snapshot.page.size;
  const blob = await pdfGenerator(html, {
    format,
    orientation: snapshot.page.orientation === 'landscape' ? 'l' : 'p',
  });
  return {
    fileName: productionProjectFileName(title, 'untitled-document', 'pdf'),
    mimeType: 'application/pdf',
    blob,
  };
}

function docxParagraph(text: string, style?: string) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${escapeXml(style)}"/></w:pPr>` : '';
  const preserve = /^\s|\s$/u.test(text) ? ' xml:space="preserve"' : '';
  return `<w:p>${styleXml}<w:r><w:t${preserve}>${escapeXml(text)}</w:t></w:r></w:p>`;
}

function documentXml(content: ProductionDocumentContentV1, title: string) {
  const blocks = markupBodyToTextBlocks(content.body);
  const body = [
    docxParagraph(String(title || '').trim() || 'Untitled document', 'Title'),
    ...blocks.map((block) => {
      if (block.kind === 'heading')
        return docxParagraph(block.text, `Heading${Math.min(6, Math.max(1, block.level || 1))}`);
      if (block.kind === 'list') return docxParagraph(`• ${block.text}`, 'ListParagraph');
      return docxParagraph(block.text);
    }),
  ].join('');
  const letter = content.page.size === 'letter';
  let width = letter ? 12240 : 11906;
  let height = letter ? 15840 : 16838;
  const landscape = content.page.orientation === 'landscape';
  if (landscape) [width, height] = [height, width];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="${width}" w:h="${height}"${landscape ? ' w:orient="landscape"' : ''}/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="330" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:rPr><w:b/><w:sz w:val="40"/></w:rPr></w:style>${[1, 2, 3, 4, 5, 6].map((level) => `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="${Math.max(24, 36 - level * 2)}"/></w:rPr></w:style>`).join('')}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="360"/></w:pPr></w:style></w:styles>`;

export async function exportProductionDocumentDocx(
  content: ProductionDocumentContentV1,
  title: string,
): Promise<ProductionProjectExportFile> {
  const snapshot = assertDocumentSnapshot(content);
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  addDeterministicZipFile(
    zip,
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
  );
  addDeterministicZipFile(
    zip,
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
  );
  addDeterministicZipFile(zip, 'word/document.xml', documentXml(snapshot, title));
  addDeterministicZipFile(zip, 'word/styles.xml', DOCX_STYLES);
  addDeterministicZipFile(
    zip,
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  addDeterministicZipFile(zip, 'docProps/core.xml', ooxmlCoreProperties(title));
  addDeterministicZipFile(
    zip,
    'docProps/app.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Light Note</Application><AppVersion>1.0</AppVersion></Properties>`,
  );
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: DOCX_MIME,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return {
    fileName: productionProjectFileName(title, 'untitled-document', 'docx'),
    mimeType: DOCX_MIME,
    blob,
  };
}
