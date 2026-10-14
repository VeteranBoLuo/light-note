import { describe, expect, it } from 'vitest';
import { convertDocxXmlToMarkdown } from './toolboxDocumentText';

const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

describe('toolbox document text', () => {
  it('converts headings, formatting, lists and tables from DOCX XML', () => {
    const documentXml = `
      <w:document xmlns:w="${namespace}">
        <w:body>
          <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Demo</w:t></w:r></w:p>
          <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r><w:r><w:t> text</w:t></w:r></w:p>
          <w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>First item</w:t></w:r></w:p>
          <w:tbl>
            <w:tr><w:tc><w:p><w:r><w:t>Name</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr>
            <w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc></w:tr>
          </w:tbl>
        </w:body>
      </w:document>`;
    const result = convertDocxXmlToMarkdown(documentXml);
    expect(result.markdown).toContain('# Demo');
    expect(result.markdown).toContain('**Bold** text');
    expect(result.markdown).toContain('- First item');
    expect(result.markdown).toContain('| Name | Value |');
    expect(result.stats).toMatchObject({ paragraphs: 3, headings: 1, tables: 1 });
  });

  it('keeps external hyperlinks from document relationships', () => {
    const documentXml = `
      <w:document xmlns:w="${namespace}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <w:body><w:p><w:hyperlink r:id="rId1"><w:r><w:t>Light Note</w:t></w:r></w:hyperlink></w:p></w:body>
      </w:document>`;
    const relationships = `
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Target="https://example.com" />
      </Relationships>`;
    expect(convertDocxXmlToMarkdown(documentXml, relationships).markdown).toBe('[Light Note](https://example.com)');
  });

  const paragraph = (text: string, level = 0, numId = 1) =>
    `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
  const document = (body: string) => `<w:document xmlns:w="${namespace}"><w:body>${body}</w:body></w:document>`;
  const numbering = `<w:numbering xmlns:w="${namespace}">
    <w:abstractNum w:abstractNumId="0">
      <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl>
      <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/></w:lvl>
    </w:abstractNum>
    <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
    <w:num w:numId="2"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="5"/></w:lvlOverride></w:num>
  </w:numbering>`;

  it('preserves ordered lists, nested bullets, list continuation and start overrides', () => {
    const xml = document(
      paragraph('First') +
        paragraph('Nested', 1) +
        paragraph('Second') +
        paragraph('Restart', 0, 2) +
        paragraph('Continue', 0, 2),
    );
    expect(convertDocxXmlToMarkdown(xml, '', numbering).markdown).toBe(
      '1. First\n\n    - Nested\n\n2. Second\n\n5. Restart\n\n6. Continue',
    );
  });

  it('preserves hard breaks and tabs without joining adjacent words', () => {
    const xml = document(
      '<w:p><w:r><w:rPr><w:b w:val="0"/></w:rPr><w:t>First</w:t><w:br/><w:t>Second</w:t><w:tab/><w:t>Third</w:t><w:cr/><w:t>Fourth</w:t></w:r></w:p>',
    );
    expect(convertDocxXmlToMarkdown(xml).markdown).toBe('First  \nSecond\tThird  \nFourth');
  });

  it('keeps continuation lines within the list item and keeps table rows intact', () => {
    const list = paragraph('First').replace('</w:r>', '<w:br/><w:t>Next line</w:t></w:r>');
    expect(convertDocxXmlToMarkdown(document(list), '', numbering).markdown).toBe('1. First  \n   Next line');
    const table = `<w:tbl><w:tr><w:tc>${list}</w:tc></w:tr></w:tbl>`;
    expect(convertDocxXmlToMarkdown(document(table), '', numbering).markdown).toContain('| 1. First<br>   Next line |');
  });

  it('reads numbering from the real DOCX archive', async () => {
    const { default: JSZip } = await import('jszip');
    const { convertDocxToMarkdown } = await import('./toolboxDocumentText');
    const zip = new JSZip();
    zip.file('word/document.xml', document(paragraph('First') + paragraph('Second')));
    zip.file('word/numbering.xml', numbering);
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const file = { name: 'numbered.docx', size: buffer.byteLength, arrayBuffer: async () => buffer } as File;
    expect((await convertDocxToMarkdown(file)).markdown).toBe('1. First\n\n2. Second');
  });
});

it('exports only embedded supported images, keeping local asset links and skipping external images', async () => {
  const { default: JSZip } = await import('jszip');
  const { convertDocxToMarkdown } = await import('./toolboxDocumentText');
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="${namespace}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>Diagram</w:t><w:drawing><a:blip r:embed="image1"/></w:drawing></w:r></w:p><w:p><w:r><w:drawing><a:blip r:embed="external"/></w:drawing></w:r></w:p></w:body></w:document>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<Relationships><Relationship Id="image1" Target="media/image.png"/><Relationship Id="external" Target="https://example.com/image.png" TargetMode="External"/></Relationships>',
  );
  zip.file('word/media/image.png', Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]));
  const bytes = await zip.generateAsync({ type: 'arraybuffer' });
  const result = await convertDocxToMarkdown({
    name: 'image.docx',
    size: bytes.byteLength,
    arrayBuffer: async () => bytes,
  } as File);
  expect(result.markdown).toContain('![Image](assets/image-1.png)');
  expect(result.images).toHaveLength(1);
  expect(result.images?.[0]?.mimeType).toBe('image/png');
  expect(result.skippedImages).toBe(1);
  expect(result.markdown).not.toContain('example.com');
});

it('stops highly compressed oversized document XML before conversion', async () => {
  const { default: JSZip } = await import('jszip');
  const { convertDocxToMarkdown } = await import('./toolboxDocumentText');
  const zip = new JSZip();
  zip.file('word/document.xml', 'x'.repeat(21 * 1024 * 1024));
  const bytes = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  await expect(
    convertDocxToMarkdown({ name: 'large.docx', size: bytes.byteLength, arrayBuffer: async () => bytes } as File),
  ).rejects.toThrow('TOO_LARGE');
});
