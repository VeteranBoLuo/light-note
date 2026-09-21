import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
vi.mock('../../db/index.js', () => ({ default: { query: vi.fn() } }));
import { renderNote, createBookmarkWorkbook } from './documents.js';
import { buildPaths } from './resources.js';
import { normalizeDataExportOptions, splitExportText, safeExportName } from '@lightnote/shared/data-export';
let dir;
beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-export-doc-'));
});
afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
  'base64',
);
function context(overrides = {}) {
  return {
    options: { noteFormat: 'html', includeImages: true },
    directory: dir,
    owner: 'u',
    db: {},
    signal: new AbortController().signal,
    images: new Map(),
    imageBytes: 0,
    paths: new Map([['target', '笔记/目标.html']]),
    readImage: vi.fn().mockResolvedValue(png),
    ...overrides,
  };
}
describe('portable documents', () => {
  it('keeps mixed original formats and resolves cross-format local links', async () => {
    const options = normalizeDataExportOptions({ types: ['notes'], noteFormat: 'original', includeImages: false });
    const notes = [
      { id: 'rich', title: '富文本', type: 'html', content: '<h1>富文本</h1><a href="/noteLibrary/md">文档</a>' },
      { id: 'md', title: '文档', type: 'markdown', content: '# 文档\n\n**正文**\n\n[富文本](/noteLibrary/rich)' },
      { id: 'draw', title: '绘画', type: 'drawing', content: '{"elements":[]}' },
    ];
    const { paths } = buildPaths(notes, [], 'original');
    expect([...paths.values()]).toEqual(['笔记/富文本.html', '笔记/文档.md', '笔记/绘画.json']);
    const ctx = context({ options, paths: new Map(notes.map(n => [n.id, paths.get('notes:' + n.id)])) });
    const output = await Promise.all(notes.map(n => renderNote(n, { path: paths.get('notes:' + n.id) }, ctx)));
    expect(output[0].content).toContain('<html');
    expect(output[0].content).toContain(encodeURIComponent('文档') + '.md');
    expect(output[1].content).toContain('# 文档');
    expect(output[1].content).toContain('**正文**');
    expect(output[1].content).toContain(encodeURIComponent('富文本') + '.html');
    expect(output[1].content).not.toContain('<html');
    expect(output[2].content).toBe(notes[2].content);
  });
  it('downloads and deduplicates images, rewrites links and avoids duplicate title', async () => {
    const ctx = context();
    const result = await renderNote(
      {
        title: '中文',
        type: 'html',
        content:
          '<h1>中文</h1><p>Hello</p><img src="https://example.com/a.png"><img src="https://example.com/a.png"><a href="/noteLibrary/target">目标</a>',
      },
      { path: '笔记/中文.html' },
      ctx,
    );
    expect((result.content.match(/<h1>/g) || []).length).toBe(1);
    expect(result.content).toContain('%E5%9B%BE%E7%89%87/');
    expect(result.content).toContain('%E7%9B%AE%E6%A0%87.html');
    expect(ctx.readImage).toHaveBeenCalledTimes(1);
    expect(result.warnings).toEqual([]);
    expect(await fs.readdir(path.join(dir, '笔记/图片'))).toHaveLength(1);
  });
  it('retains unavailable links and reports partial images', async () => {
    const r = await renderNote(
      { title: 'T', type: 'html', content: '<img alt="图" src="https://example.com/missing.png">' },
      { path: '笔记/T.html' },
      context({ readImage: vi.fn().mockRejectedValue(new Error()) }),
    );
    expect(r.content).toContain('https://example.com/missing.png');
    expect(r.warnings).toHaveLength(1);
  });
  it('removes images without fetching and preserves captions in Markdown', async () => {
    const ctx = context({ options: { noteFormat: 'markdown', includeImages: false } });
    const r = await renderNote(
      { title: 'T', type: 'markdown', content: '# T\n\n![图示](https://example.com/x)\n\n- [x] done' },
      { path: '笔记/T.md' },
      ctx,
    );
    expect(r.content).toContain('图示');
    expect(r.content).not.toContain('example.com');
    expect(r.content).toContain('[x]');
    expect(ctx.readImage).not.toHaveBeenCalled();
  });
  it('preserves drawings and rejects unsupported content explicitly', async () => {
    expect((await renderNote({ type: 'drawing', content: '{"elements":[]}' }, {}, context())).content).toBe(
      '{"elements":[]}',
    );
    await expect(
      renderNote({ type: 'html', content: '<iframe src="https://example.com"></iframe>' }, {}, context()),
    ).rejects.toMatchObject({ code: 'DATA_EXPORT_CONVERSION_FAILED' });
  });
  it('exports full long text with safe text cells and links', async () => {
    const file = path.join(dir, 'bookmarks.xlsx'),
      w = createBookmarkWorkbook(file),
      body = '中'.repeat(29999) + '😀' + '文'.repeat(40000);
    w.append({
      title: '=HYPERLINK("bad")',
      url: 'https://example.com',
      description: '说明',
      content: body,
      tags: 'one',
      create_time: new Date('2026-09-21T00:00:00Z'),
    });
    await w.commit();
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(file);
    const sheet = book.getWorksheet('书签'),
      long = book.getWorksheet('长正文');
    expect(sheet.getCell('A2').value).toBe('=HYPERLINK("bad")');
    expect(sheet.getCell('D2').value.hyperlink).toContain('长正文');
    const chunks = [];
    long.eachRow((row, n) => {
      if (n > 1) chunks.push(row.getCell(4).value);
    });
    expect(chunks.join('')).toBe(body);
    expect(chunks.every((c) => c.length <= 30000)).toBe(true);
  });
  it('maps duplicate names and nested trees without path traversal', () => {
    const { paths, filePath } = buildPaths(
      [
        { id: '1', title: '../A', type: 'html' },
        { id: '2', title: '../A', type: 'html' },
        { id: '3', title: '子', parent_id: '1', type: 'drawing' },
      ],
      [{ id: 1, name: '资料' }],
      'html',
    );
    expect(new Set(paths.values()).size).toBe(3);
    expect(paths.get('notes:3')).toContain('/子.json');
    expect(filePath({ title: 'x.pdf', folder_id: 1 })).toBe('文件/资料/x.pdf');
    expect(filePath({ title: 'x.pdf', folder_id: 1 })).toContain('(2)');
    expect(safeExportName('CON')).toBe('_CON');
  });
  it('validates shared options and keeps Unicode intact', () => {
    expect(() => normalizeDataExportOptions({ types: [], noteFormat: 'html', includeImages: true })).toThrow();
    expect(splitExportText('a'.repeat(29999) + '😀')).toEqual(['a'.repeat(29999), '😀']);
  });
});
