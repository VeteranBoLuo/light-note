import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import type { ProductionPresentationContentV1 } from '@lightnote/shared/production-project-protocol';
import {
  buildProductionPresentationSlideSvg,
  exportProductionPresentationPdf,
  exportProductionPresentationPngZip,
  exportProductionPresentationPptx,
  isProductionPresentationExportOverflowError,
  productionPresentationExportOverflowIssues,
} from './productionProjectPresentationExport';

function presentationSnapshot(): ProductionPresentationContentV1 {
  return {
    type: 'presentation',
    schemaVersion: 1,
    canvas: { aspectRatio: '16:9' },
    theme: { name: 'Light', accent: '#615ced', background: '#ffffff' },
    slides: [
      {
        id: 'slide-1',
        title: 'Revenue < Growth & Risk',
        body: { format: 'markdown', value: '- First\n- Second & final' },
        notes: 'Speaker-only <note> & cue',
        layout: 'content',
        extensions: {},
      },
    ],
    extensions: {},
  };
}

function onePixelPng() {
  const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=');
  return new Blob([Uint8Array.from(binary, (character) => character.charCodeAt(0))], { type: 'image/png' });
}

describe('production project presentation export', () => {
  it('creates a real PPTX package with slide relationships and escaped XML', async () => {
    const exported = await exportProductionPresentationPptx(presentationSnapshot(), 'Quarter/Review');
    expect(exported.fileName).toBe('Quarter Review.pptx');
    const zip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
    expect(Object.keys(zip.files)).toEqual(
      expect.arrayContaining([
        '[Content_Types].xml',
        'ppt/presentation.xml',
        'ppt/_rels/presentation.xml.rels',
        'ppt/slides/slide1.xml',
        'ppt/slides/_rels/slide1.xml.rels',
        'ppt/notesSlides/notesSlide1.xml',
        'ppt/notesSlides/_rels/notesSlide1.xml.rels',
        'ppt/notesMasters/notesMaster1.xml',
        'ppt/notesMasters/_rels/notesMaster1.xml.rels',
        'ppt/slideMasters/slideMaster1.xml',
        'ppt/slideLayouts/slideLayout1.xml',
        'ppt/theme/theme1.xml',
      ]),
    );
    const contentTypes = await zip.file('[Content_Types].xml')!.async('string');
    const slideXml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const notesXml = await zip.file('ppt/notesSlides/notesSlide1.xml')!.async('string');
    const slideRelationships = await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('string');
    expect(contentTypes).toContain('presentationml.slide+xml');
    expect(contentTypes).toContain('presentationml.notesSlide+xml');
    expect(contentTypes).toContain('presentationml.notesMaster+xml');
    expect(new DOMParser().parseFromString(contentTypes, 'application/xml').querySelector('parsererror')).toBeNull();
    expect(new DOMParser().parseFromString(slideXml, 'application/xml').querySelector('parsererror')).toBeNull();
    expect(new DOMParser().parseFromString(notesXml, 'application/xml').querySelector('parsererror')).toBeNull();
    expect(slideXml).toContain('Revenue &lt; Growth &amp; Risk');
    expect(slideXml).not.toContain('Speaker-only');
    expect(notesXml).toContain('Speaker-only &lt;note&gt; &amp; cue');
    expect(slideRelationships).toContain('relationships/notesSlide');
  });

  it('keeps inserted text, shapes and embedded images in rendered and editable exports', async () => {
    const imageData =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const content = presentationSnapshot();
    content.slides[0]!.elements = [
      {
        id: 'element-text',
        type: 'text',
        x: 8,
        y: 12,
        width: 32,
        height: 16,
        rotation: 0,
        text: 'Editable callout',
        fontSize: 28,
        fontWeight: 700,
        color: '#20232d',
        align: 'center',
        verticalAlign: 'middle',
        fill: '#e9e7ff',
      },
      {
        id: 'element-shape',
        type: 'shape',
        x: 48,
        y: 18,
        width: 26,
        height: 22,
        rotation: 8,
        shape: 'diamond',
        fill: '#ffffff',
        stroke: '#615ced',
        strokeWidth: 3,
        text: 'Decision',
        color: '#20232d',
        fontSize: 20,
      },
      {
        id: 'element-image',
        type: 'image',
        x: 60,
        y: 52,
        width: 22,
        height: 28,
        rotation: 0,
        src: imageData,
        alt: 'One pixel',
        fit: 'contain',
      },
    ];
    const svg = buildProductionPresentationSlideSvg(content, 0);
    expect(svg).toContain('Editable callout');
    expect(svg).toContain('<polygon');
    expect(svg).toContain(imageData);

    const exported = await exportProductionPresentationPptx(content, 'Elements');
    const zip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
    const slideXml = await zip.file('ppt/slides/slide1.xml')!.async('string');
    const relationships = await zip.file('ppt/slides/_rels/slide1.xml.rels')!.async('string');
    expect(slideXml).toContain('Editable callout');
    expect(slideXml).toContain('prst="diamond"');
    expect(slideXml).toContain('<p:pic>');
    expect(relationships).toContain('relationships/image');
    expect(Object.keys(zip.files)).toContain('ppt/media/slide1-image1.png');
  });

  it('emits visibly different SVG and PPTX structures for every supported layout', async () => {
    const layouts = ['title', 'section', 'content', 'two_column', 'blank'] as const;
    const content: ProductionPresentationContentV1 = {
      ...presentationSnapshot(),
      slides: layouts.map((layout, index) => ({
        ...presentationSnapshot().slides[0]!,
        id: `slide-${layout}`,
        title: layout === 'blank' ? '' : `${layout} title`,
        body: { format: 'markdown', value: layout === 'blank' ? '' : '- One\n- Two\n- Three\n- Four' },
        layout,
        notes: `Notes ${index + 1}`,
      })),
    };
    const svgByLayout = layouts.map((_, index) => buildProductionPresentationSlideSvg(content, index));
    expect(svgByLayout[0]).toContain('data-layout="title"');
    expect(svgByLayout[0]).toContain('text-anchor="middle"');
    expect(svgByLayout[1]).toContain('width="448"');
    expect(svgByLayout[2]).toContain('width="18"');
    expect(svgByLayout[3]).toContain(`x1="800"`);
    expect(svgByLayout[4]).not.toContain('blank title');

    const exported = await exportProductionPresentationPptx(content, 'Layouts');
    const zip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
    const slideXml = await Promise.all(
      layouts.map((_, index) => zip.file(`ppt/slides/slide${index + 1}.xml`)!.async('string')),
    );
    expect(new Set(slideXml).size).toBe(layouts.length);
    expect(slideXml[0]).toContain('Title Center');
    expect(slideXml[1]).toContain('Section Accent');
    expect(slideXml[2]).toContain('Content Accent');
    expect(slideXml[3]).toContain('Left Column');
    expect(slideXml[3]).toContain('Right Column');
    expect(slideXml[4]).not.toContain('blank title');
    expect(slideXml[4]).not.toContain('Content Accent');
  });

  it('builds escaped SVG snapshots and packages one PNG per slide', async () => {
    const content = presentationSnapshot();
    const svg = buildProductionPresentationSlideSvg(content, 0);
    expect(svg).toContain('Revenue &lt; Growth &amp; Risk');
    expect(svg).toContain('Second &amp; final');
    const renderer = vi.fn(async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
    const exported = await exportProductionPresentationPngZip(content, 'Slides', renderer);
    const zip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
    expect(Object.keys(zip.files)).toContain('slide-001.png');
    expect(renderer).toHaveBeenCalledWith(expect.objectContaining({ index: 0, width: 1600, height: 900 }));
  });

  it('keeps the final accepted line in SVG, PNG and PPTX instead of silently truncating it', async () => {
    const finalLine = 'FINAL-LINE-MUST-REMAIN';
    const lines = [...Array.from({ length: 15 }, (_, index) => `Line ${index + 1}`), finalLine];
    const content: ProductionPresentationContentV1 = {
      ...presentationSnapshot(),
      slides: [
        {
          ...presentationSnapshot().slides[0]!,
          body: { format: 'markdown', value: lines.join('\n') },
          layout: 'content',
        },
      ],
    };

    expect(productionPresentationExportOverflowIssues(content)).toEqual([]);
    expect(buildProductionPresentationSlideSvg(content, 0)).toContain(finalLine);

    let pngSvg = '';
    const renderer = vi.fn(async (snapshot: { svg: string }) => {
      pngSvg = snapshot.svg;
      return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    });
    await exportProductionPresentationPngZip(content, 'Complete lines', renderer);
    expect(pngSvg).toContain(finalLine);

    const exported = await exportProductionPresentationPptx(content, 'Complete lines');
    const zip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
    expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain(finalLine);
  });

  it('blocks every export path before rendering when a layout cannot safely contain all lines', async () => {
    const content: ProductionPresentationContentV1 = {
      ...presentationSnapshot(),
      slides: [
        {
          ...presentationSnapshot().slides[0]!,
          body: {
            format: 'markdown',
            value: Array.from({ length: 17 }, (_, index) => `Line ${index + 1}`).join('\n'),
          },
          layout: 'content',
        },
      ],
    };
    const issues = productionPresentationExportOverflowIssues(content);
    expect(issues).toEqual([
      expect.objectContaining({ slideNumber: 1, layout: 'content', lineCount: 17, maxLines: 16 }),
    ]);
    expect(() => buildProductionPresentationSlideSvg(content, 0)).toThrowError(
      expect.objectContaining({ code: 'PRODUCTION_PRESENTATION_EXPORT_OVERFLOW' }),
    );

    const renderer = vi.fn(async () => new Blob([], { type: 'image/png' }));
    for (const exportAttempt of [
      () => exportProductionPresentationPptx(content, 'Overflow'),
      () => exportProductionPresentationPngZip(content, 'Overflow', renderer),
      () => exportProductionPresentationPdf(content, 'Overflow', renderer),
    ]) {
      let caught: unknown;
      try {
        await exportAttempt();
      } catch (error) {
        caught = error;
      }
      expect(isProductionPresentationExportOverflowError(caught)).toBe(true);
    }
    expect(renderer).not.toHaveBeenCalled();
  });

  it('treats one very long body line as visible wrapped lines and refuses horizontal clipping', async () => {
    const finalMarker = 'FINAL-SINGLE-LINE-MARKER';
    const content: ProductionPresentationContentV1 = {
      ...presentationSnapshot(),
      slides: [
        {
          ...presentationSnapshot().slides[0]!,
          body: { format: 'markdown', value: `${'A'.repeat(1_300)}${finalMarker}` },
          layout: 'content',
        },
      ],
    };
    const [issue] = productionPresentationExportOverflowIssues(content);
    expect(issue).toMatchObject({ slideNumber: 1, layout: 'content', maxLines: 16 });
    expect(issue!.lineCount).toBeGreaterThan(16);

    let caught: unknown;
    try {
      await exportProductionPresentationPptx(content, 'Long line');
    } catch (error) {
      caught = error;
    }
    expect(isProductionPresentationExportOverflowError(caught)).toBe(true);
  });

  it('wraps an accepted long single line and retains its final marker in SVG and PPTX', async () => {
    const finalMarker = 'FINAL-WRAPPED-MARKER';
    const content: ProductionPresentationContentV1 = {
      ...presentationSnapshot(),
      slides: [
        {
          ...presentationSnapshot().slides[0]!,
          body: { format: 'markdown', value: `${'a'.repeat(72 * 15)} ${finalMarker}` },
          layout: 'content',
        },
      ],
    };
    expect(productionPresentationExportOverflowIssues(content)).toEqual([]);
    expect(buildProductionPresentationSlideSvg(content, 0)).toContain(finalMarker);

    const exported = await exportProductionPresentationPptx(content, 'Wrapped line');
    const zip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
    expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain(finalMarker);
  });

  it('wraps a supported long title consistently and retains its tail across rendered exports', async () => {
    const finalMarker = 'FINAL-TITLE-MARKER';
    const content: ProductionPresentationContentV1 = {
      ...presentationSnapshot(),
      slides: [
        {
          ...presentationSnapshot().slides[0]!,
          title: `${'a'.repeat(56)} ${finalMarker}`,
          body: { format: 'markdown', value: 'Body' },
          layout: 'title',
        },
      ],
    };
    expect(productionPresentationExportOverflowIssues(content)).toEqual([]);
    const svg = buildProductionPresentationSlideSvg(content, 0);
    expect(svg).toContain(finalMarker);
    expect(svg.match(/font-weight="700"/gu)).toHaveLength(2);

    let pngSvg = '';
    const renderer = vi.fn(async (snapshot: { svg: string }) => {
      pngSvg = snapshot.svg;
      return new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    });
    await exportProductionPresentationPngZip(content, 'Long title', renderer);
    expect(pngSvg).toContain(finalMarker);

    const exported = await exportProductionPresentationPptx(content, 'Long title');
    const zip = await JSZip.loadAsync(await exported.blob.arrayBuffer());
    expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain(finalMarker);

    let pdfSvg = '';
    const pdf = await exportProductionPresentationPdf(content, 'Long title', async (snapshot) => {
      pdfSvg = snapshot.svg;
      return onePixelPng();
    });
    expect(pdfSvg).toContain(finalMarker);
    expect(pdf.blob.size).toBeGreaterThan(100);
  });

  it('rejects a 300-character title before PPTX, PNG or PDF can crop it', async () => {
    const content: ProductionPresentationContentV1 = {
      ...presentationSnapshot(),
      slides: [
        {
          ...presentationSnapshot().slides[0]!,
          title: 'W'.repeat(300),
          body: { format: 'markdown', value: 'Body' },
          layout: 'content',
        },
      ],
    };
    expect(productionPresentationExportOverflowIssues(content)).toEqual([
      expect.objectContaining({ slideNumber: 1, field: 'title', maxLines: 2 }),
    ]);
    const renderer = vi.fn(async () => new Blob([], { type: 'image/png' }));
    for (const exportAttempt of [
      () => exportProductionPresentationPptx(content, 'Long title'),
      () => exportProductionPresentationPngZip(content, 'Long title', renderer),
      () => exportProductionPresentationPdf(content, 'Long title', renderer),
    ]) {
      await expect(exportAttempt()).rejects.toMatchObject({ code: 'PRODUCTION_PRESENTATION_EXPORT_OVERFLOW' });
    }
    expect(renderer).not.toHaveBeenCalled();
  });

  it('rejects blank-layout slides with hidden title or body instead of exporting an empty slide', async () => {
    const content: ProductionPresentationContentV1 = {
      ...presentationSnapshot(),
      slides: [
        {
          ...presentationSnapshot().slides[0]!,
          title: 'Hidden title',
          body: { format: 'markdown', value: 'Hidden body' },
          layout: 'blank',
        },
      ],
    };
    expect(productionPresentationExportOverflowIssues(content)).toEqual([
      expect.objectContaining({ slideNumber: 1, field: 'blank', lineCount: 1, maxLines: 0 }),
    ]);
    const renderer = vi.fn(async () => new Blob([], { type: 'image/png' }));
    for (const exportAttempt of [
      () => exportProductionPresentationPptx(content, 'Blank with text'),
      () => exportProductionPresentationPngZip(content, 'Blank with text', renderer),
      () => exportProductionPresentationPdf(content, 'Blank with text', renderer),
    ]) {
      await expect(exportAttempt()).rejects.toMatchObject({ code: 'PRODUCTION_PRESENTATION_EXPORT_OVERFLOW' });
    }
    expect(renderer).not.toHaveBeenCalled();
  });

  it('handles empty presentations for PPTX, PNG ZIP and PDF', async () => {
    const empty = { ...presentationSnapshot(), slides: [] };
    const pptx = await exportProductionPresentationPptx(empty, 'Empty');
    const pptxZip = await JSZip.loadAsync(await pptx.blob.arrayBuffer());
    expect(Object.keys(pptxZip.files).some((path) => /^ppt\/slides\/slide\d+\.xml$/u.test(path))).toBe(false);

    const png = await exportProductionPresentationPngZip(empty, 'Empty');
    const pngZip = await JSZip.loadAsync(await png.blob.arrayBuffer());
    expect(await pngZip.file('README.txt')!.async('string')).toContain('no slides');

    const pdf = await exportProductionPresentationPdf(empty, 'Empty');
    expect(pdf.blob.type).toBe('application/pdf');
    expect(pdf.blob.size).toBeGreaterThan(100);
  });
});
