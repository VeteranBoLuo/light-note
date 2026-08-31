import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import type { ProductionDocumentContentV1 } from '@lightnote/shared/production-project-protocol';
import {
  buildProductionDocumentHtml,
  buildProductionDocumentMarkdown,
  exportProductionDocumentDocx,
  exportProductionDocumentPdf,
} from './productionProjectDocumentExport';

function documentSnapshot(value = '# Intro\n\n- Alpha & Beta'): ProductionDocumentContentV1 {
  return {
    type: 'document',
    schemaVersion: 1,
    body: { format: 'markdown', value },
    page: { size: 'a4', orientation: 'portrait' },
    extensions: {},
  };
}

describe('production project document export', () => {
  it('builds Markdown and semantic standalone HTML from the supplied snapshot', async () => {
    const markdown = await buildProductionDocumentMarkdown(documentSnapshot('Paragraph'), 'A/B Proposal');
    expect(markdown).toBe('# A/B Proposal\n\nParagraph');

    const html = await buildProductionDocumentHtml(documentSnapshot('# A < B\n\nText'), 'A/B <Proposal>');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<h1>A &lt; B</h1>');
    expect(html).toContain('<title>A/B &lt;Proposal&gt;</title>');

    const rich = documentSnapshot('');
    rich.body = { format: 'html', value: '<p>Safe &amp; sound</p><script>alert(1)</script>' };
    const richHtml = await buildProductionDocumentHtml(rich, 'Rich');
    expect(richHtml).toContain('<p>Safe &amp; sound</p>');
    expect(richHtml).not.toContain('<script>');
  });

  it('creates a real DOCX OOXML package with escaped immutable snapshot text', async () => {
    const exported = await exportProductionDocumentDocx(documentSnapshot('# Q&A\n\n5 < 8'), 'Roadmap: Q&A');
    expect(exported.fileName).toBe('Roadmap Q&A.docx');
    const zip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        '_rels/.rels',
        'word/document.xml',
        'word/styles.xml',
        'word/_rels/document.xml.rels',
        'docProps/core.xml',
      ]),
    );
    const contentTypes = await zip.file('[Content_Types].xml')!.async('string');
    const documentXml = await zip.file('word/document.xml')!.async('string');
    expect(contentTypes).toContain('wordprocessingml.document.main+xml');
    expect(new DOMParser().parseFromString(contentTypes, 'application/xml').querySelector('parsererror')).toBeNull();
    expect(new DOMParser().parseFromString(documentXml, 'application/xml').querySelector('parsererror')).toBeNull();
    expect(documentXml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(documentXml).toContain('Q&amp;A');
    expect(documentXml).toContain('5 &lt; 8');
    expect(documentXml).not.toContain('5 < 8');
  });

  it('exports an empty document and delegates PDF rendering with page settings', async () => {
    const empty = documentSnapshot('');
    empty.page = { size: 'letter', orientation: 'landscape' };
    const docx = await exportProductionDocumentDocx(empty, '');
    const zip = await JSZip.loadAsync(await docx.blob.arrayBuffer());
    expect(await zip.file('word/document.xml')!.async('string')).toContain('Untitled document');

    const pdfGenerator = vi.fn(async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' }));
    const pdf = await exportProductionDocumentPdf(empty, 'Draft', { pdfGenerator });
    expect(pdf.fileName).toBe('Draft.pdf');
    expect(pdfGenerator).toHaveBeenCalledWith(expect.stringContaining('<title>Draft</title>'), {
      format: 'letter',
      orientation: 'l',
    });
  });
});
