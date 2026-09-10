import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildMergedNoteExport, createNoteExportSettings, orderNotesForMergedExport } from './noteBatchExport';
import * as conversion from './noteHtmlToMarkdown';
const notes = [
  { id: 'a', title: '项目', type: 'html', content: '<h1>另一标题</h1><p><strong>原文甲</strong></p>' },
  { id: 'b', title: '日志', type: 'markdown', content: '# 日志\n\n原文乙\n\n- [x] 完成' },
];
const options = { fallbackTitle: '未命名', title: '汇总' };
describe('merged exports', () => {
  it.each([
    [['markdown', 'md'], 'markdown'],
    [['markdown', 'md', 'html'], 'markdown'],
    [['html', 'html', 'markdown'], 'html'],
    [['html', 'markdown'], 'html'],
    [[null, 'markdown'], 'html'],
    [['drawing', 'drawing', 'markdown'], 'markdown'],
    [['drawing'], 'html'],
    [[], 'html'],
  ] as const)('defaults merged format by note types %j', (types, expected) => {
    const settings = createNoteExportSettings(types.map((type, index) => ({ id: String(index), type })));
    expect(settings.mergedFormat).toBe(expected);
    expect(settings.archiveFormat).toBe('original');
    expect(settings.packaging).toBe('archive');
  });
  it('creates one HTML document with independent sections and exact heading deduplication', async () => {
    const result = await buildMergedNoteExport(notes, 'html', options);
    const html = String(result.file!.content);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(html.match(/<!DOCTYPE/g)).toHaveLength(1);
    expect([...doc.querySelectorAll('section')].map((n) => n.textContent)).toEqual([
      expect.stringContaining('项目'),
      expect.stringContaining('日志'),
    ]);
    expect([...doc.querySelectorAll('h1')].map((n) => n.textContent)).toEqual(['项目', '另一标题', '日志']);
    expect(doc.querySelector('strong')?.textContent).toBe('原文甲');
    expect(result.file).toMatchObject({ fileName: '汇总.html', mimeType: 'text/html' });
  });
  it('keeps Markdown source and explicit order without rewriting notes', async () => {
    const before = structuredClone(notes);
    const ordered = orderNotesForMergedExport(notes, notes, ['b', 'a']);
    const result = await buildMergedNoteExport(ordered, 'markdown', options);
    expect(result.file!.content).toBe(`${notes[1].content}\n\n---\n\n# 项目\n\n# 另一标题\n\n**原文甲**`);
    expect(notes).toEqual(before);
  });
  it('handles empty notes, duplicate titles, escaped titles and formatting in a matching heading', async () => {
    const items = [
      { id: '1', title: '<hello> & world', type: 'html', content: '' },
      { id: '2', title: '日志', type: 'markdown', content: '# **日志**\n\n内容' },
      { id: '3', title: '日志', type: 'html', content: '<h1>日志</h1>' },
    ];
    const html = String((await buildMergedNoteExport(items, 'html', options)).file!.content);
    expect(html).toContain('&lt;hello&gt; &amp; world');
    expect(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('section')).toHaveLength(3);
    const md = (await buildMergedNoteExport(items, 'markdown', options)).file!.content;
    expect(md).toContain('# \\<hello\\> & world');
    expect(md).toContain('# **日志**\n\n内容');
    expect(md).not.toContain('# 日志\n\n# **日志**');
  });
  it('recognizes a matching setext heading without rewriting Markdown source', async () => {
    const note = { id: 'a', title: '日志', type: 'markdown', content: '日志\n====\n\n原文' };
    expect((await buildMergedNoteExport([note], 'markdown', options)).file!.content).toBe(note.content);
  });
  it.each(['html', 'markdown'] as const)(
    'can hide matching note headings and show one escaped document title in %s',
    async (format) => {
      const items = [
        { id: '1', title: '日志', type: 'markdown', content: '\n日志\n====\n\n正文\n\n# 其他标题' },
        { id: '2', title: '项目', type: 'html', content: '<h1><strong>项目</strong></h1><p>内容</p><h2>章节</h2>' },
        { id: '3', title: '空笔记', type: 'markdown', content: '' },
      ];
      const before = structuredClone(items);
      const result = await buildMergedNoteExport(items, format, {
        ...options,
        title: '总览 <一>',
        showDocumentTitle: true,
        keepNoteTitles: false,
      });
      const body = String(result.file!.content);
      expect(body).not.toContain('日志');
      expect(body).not.toContain('项目');
      expect(body).not.toContain('空笔记');
      expect(body).toContain('其他标题');
      expect(body).toContain('章节');
      expect(body).toContain('正文');
      expect(result.file!.fileName).toBe(`总览 一.${format === 'markdown' ? 'md' : 'html'}`);
      if (format === 'html') {
        const doc = new DOMParser().parseFromString(body, 'text/html');
        expect(doc.querySelector('.note-export-document-title')?.textContent).toBe('总览 <一>');
      } else expect(body.startsWith('# 总览 \\<一\\>\n\n---\n\n')).toBe(true);
      expect(items).toEqual(before);
    },
  );
  it('uses the default name for blank input and defaults to retaining note titles without a document heading', async () => {
    const defaults = createNoteExportSettings(notes, '目录');
    expect(defaults).toMatchObject({
      exportName: '',
      defaultName: '目录',
      showDocumentTitle: false,
      keepNoteTitles: true,
    });
    const result = await buildMergedNoteExport(notes, 'html', { ...options, title: '   ' });
    expect(result.file!.fileName).toMatch(/^lightnote-notes-\d{4}-\d{2}-\d{2}\.html$/);
    expect(String(result.file!.content)).not.toContain('class="note-export-document-title"');
  });
  it('renders the overall PDF heading once, applies note title visibility and sets PDF metadata', async () => {
    const generator = vi.fn(async (_html: string) => {
      const doc = await PDFDocument.create();
      doc.addPage();
      return new Blob([new Uint8Array(await doc.save())]);
    });
    const result = await buildMergedNoteExport(notes, 'pdf', {
      ...options,
      showDocumentTitle: true,
      keepNoteTitles: false,
      pdfGenerator: generator,
    });
    const htmls = generator.mock.calls.map((args) => new DOMParser().parseFromString(String(args[0]), 'text/html'));
    expect(htmls[0].querySelector('.note-export-document-title')?.textContent).toBe('汇总');
    expect(htmls[1].querySelector('.note-export-document-title')).toBeNull();
    expect(htmls[1].querySelector('h1')).toBeNull();
    const pdf = await PDFDocument.load(await (result.file!.content as Blob).arrayBuffer());
    expect(pdf.getPageCount()).toBe(2);
    expect(pdf.getTitle()).toBe('汇总');
  });
  it('rejects drawing and missing, duplicate, unexpected or type-changed members', async () => {
    expect((await buildMergedNoteExport([...notes, { id: 'c', type: 'drawing' }], 'html', options)).file).toBeNull();
    for (const [actual, ids] of [
      [notes.slice(1), ['a', 'b']],
      [notes, ['a', 'a']],
      [notes, ['a', 'x']],
      [
        [{ ...notes[0], type: 'drawing' }, notes[1]],
        ['a', 'b'],
      ],
    ] as const) {
      expect(() => orderNotesForMergedExport([...actual], notes, [...ids])).toThrow('NOTE_EXPORT_SCOPE_CHANGED');
    }
    expect(createNoteExportSettings(notes)).toMatchObject({
      packaging: 'archive',
      archiveFormat: 'original',
      mergedFormat: 'html',
      orderedIds: ['a', 'b'],
    });
  });
  it('does not return HTML as Markdown when conversion throws', async () => {
    const spy = vi.spyOn(conversion, 'createNoteTurndownService').mockReturnValue({
      turndown: () => {
        throw new Error('bad conversion');
      },
    } as any);
    try {
      expect(await buildMergedNoteExport(notes, 'markdown', options)).toEqual({ file: null, failedNoteIds: ['a'] });
    } finally {
      spy.mockRestore();
    }
  });
  it('combines PDF pages in order and does not render multiple notes concurrently', async () => {
    let active = 0;
    const generator = vi.fn(async (html: string) => {
      expect(++active).toBe(1);
      const doc = await PDFDocument.create();
      doc.addPage([html.includes('<title>项目') ? 200 : 300, 400]);
      const blob = new Blob([new Uint8Array(await doc.save())]);
      active--;
      return blob;
    });
    const result = await buildMergedNoteExport(notes, 'pdf', { ...options, pdfGenerator: generator });
    const merged = await PDFDocument.load(await (result.file!.content as Blob).arrayBuffer());
    expect(merged.getPages().map((p) => p.getWidth())).toEqual([200, 300]);
    expect(generator).toHaveBeenCalledTimes(2);
  });
  it('returns no partial PDF on rendering failure and stops cancelled jobs', async () => {
    expect(
      (
        await buildMergedNoteExport(notes, 'pdf', {
          ...options,
          pdfGenerator: async () => {
            throw new Error('render failed');
          },
        })
      ).file,
    ).toBeNull();
    await expect(buildMergedNoteExport(notes, 'html', { ...options, isCurrent: () => false })).rejects.toThrow(
      'NOTE_EXPORT_CANCELLED',
    );
  });
});
