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
});
