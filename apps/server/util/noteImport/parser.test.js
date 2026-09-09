import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseImportFiles, safeArchivePath, readZip } from './parser.js';
import { writeJson, readJson } from './storage.js';
let dir;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-import-'));
  await fs.mkdir(path.join(dir, 'uploads'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});
async function upload(name, content) {
  const key = 'input';
  await fs.writeFile(path.join(dir, 'uploads', key), content);
  await writeJson(path.join(dir, 'uploads', key + '.json'), { key, name });
}
// Small uncompressed ZIP fixtures, no external files or DB required.
function zip(files) {
  const locals = [],
    centrals = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const n = Buffer.from(name),
      b = Buffer.from(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(0x800, 6);
    h.writeUInt32LE(b.length, 18);
    h.writeUInt32LE(b.length, 22);
    h.writeUInt16LE(n.length, 26);
    locals.push(h, n, b);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x800, 8);
    c.writeUInt32LE(b.length, 20);
    c.writeUInt32LE(b.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    centrals.push(c, n);
    offset += h.length + n.length + b.length;
  }
  const central = Buffer.concat(centrals),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
describe('note import parser', () => {
  it('preserves Markdown code, tasks and repeated text while replacing real missing images', async () => {
    const source = '# 中文\n\n- [ ] task\n\n```md\n![code](missing.png)\n```\n\n![real](missing.png)\n';
    await upload('笔记.md', source);
    const [item] = await parseImportFiles(dir);
    const body = await readJson(path.join(dir, item.id + '.json'));
    expect(body.content).toContain('![code](missing.png)');
    expect(body.content).toContain('- [ ] task');
    expect(body.content).toContain('[real]');
    expect(item.warnings).toContain('missing_image');
  });
  it('strips active HTML and keeps tables', async () => {
    await upload(
      'test.html',
      '<html><head><style>body{color:red}</style></head><body><script>alert(1)</script><table><tr><td>Hello</td></tr></table><img src="javascript:alert(1)" onerror="x()"></body></html>',
    );
    const [i] = await parseImportFiles(dir);
    const { content } = await readJson(path.join(dir, i.id + '.json'));
    expect(content).toContain('<table>');
    expect(content).not.toMatch(/script|onerror|javascript|<style/);
  });
  it('resolves Unicode relative ZIP assets and deduplicates shared images', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
      'base64',
    );
    await upload('notes.zip', zip({ '目录/a.md': '![a](../图片.png)\n\n![b](../图片.png)', '图片.png': png }));
    const [i] = await parseImportFiles(dir);
    expect(i.errorCode).toBeUndefined();
    expect(i.images).toHaveLength(1);
    expect(i.warnings).not.toContain('missing_image');
    const { content } = await readJson(path.join(dir, i.id + '.json'));
    expect(content.match(/note-import.invalid/g)).toHaveLength(2);
  });
  it('rejects traversal and expansion budgets', async () => {
    expect(() => safeArchivePath('../a.md')).toThrow();
    expect(() => safeArchivePath('C:\\a.md')).toThrow();
    await expect(readZip(zip({ 'a.md': 'abc' }), { entries: 2000, bytes: 0 })).rejects.toThrow();
  });
  it('reports bad encoding per file', async () => {
    await upload('bad.md', Buffer.from([0xc3, 0x28]));
    const [i] = await parseImportFiles(dir);
    expect(i.errorCode).toBe('NOTE_IMPORT_ENCODING');
  });
  it('uses task-specific stable item identities', async () => {
    await upload('a.md', 'a');
    const [first] = await parseImportFiles(dir);
    const [again] = await parseImportFiles(dir);
    expect(again.id).toBe(first.id);
  });
  it('converts Word paragraphs and tables to HTML', async () => {
    await upload(
      'word.docx',
      zip({
        '[Content_Types].xml':
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        '_rels/.rels':
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        'word/document.xml':
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello Word</w:t></w:r></w:p></w:body></w:document>',
      }),
    );
    const [i] = await parseImportFiles(dir);
    expect(i.errorCode).toBeUndefined();
    const { content } = await readJson(path.join(dir, i.id + '.json'));
    expect(content).toContain('<p>Hello Word</p>');
  });
});

describe('image source diagnostics', () => {
  it('ignores only empty closed lightbox scaffolding and preserves dialog prose', async () => {
    await upload(
      'test.html',
      '<p>Body</p><dialog><button>Close</button><img alt="Zoom"></dialog><dialog><p>Keep me</p><img></dialog>',
    );
    const [item] = await parseImportFiles(dir);
    const output = await readJson(path.join(dir, `${item.id}.json`));
    expect(item.warnings).not.toContain('missing_image');
    expect(item.warnings).toContain('image_source_missing');
    expect(output.content).not.toContain('Zoom');
    expect(output.content).not.toContain('Close');
    expect(output.content).toContain('Keep me');
  });
  it('distinguishes missing files, source-less nodes and external links with safe detail', async () => {
    await upload('test.html', '<img src="/private/secret/photo.png"><img><img src="https://example.com/a.png">');
    const [item] = await parseImportFiles(dir);
    expect(item.warnings).toEqual(expect.arrayContaining(['missing_image', 'image_source_missing', 'external_image']));
    expect(item.warningDetails.find((d) => d.code === 'missing_image')).toEqual({
      code: 'missing_image',
      count: 1,
      sources: ['photo.png'],
    });
    expect(JSON.stringify(item.warningDetails)).not.toContain('/private');
    expect(item.images).toHaveLength(0);
  });
  it('reports document and image stages without executing source scripts', async () => {
    await upload('test.html', '<p>Hello</p><img src="https://example.com/a.png"><script>throw Error()</script>');
    const progress = [];
    await parseImportFiles(dir, (value) => progress.push(value));
    expect(progress.map((p) => p.stage)).toEqual(
      expect.arrayContaining(['reading', 'extracting_images', 'sanitizing', 'parsed']),
    );
    expect(progress.at(-1)).toMatchObject({ filesDone: 1, filesTotal: 1, imagesDone: 1, imagesTotal: 1 });
  });
});

it('does not label unsupported embedded formats as missing local files', async () => {
  await upload('image.html', '<img src="data:image/svg+xml;base64,PHN2Zy8+">');
  const [item] = await parseImportFiles(dir);
  expect(item.warnings).toContain('unsupported_image');
  expect(item.warnings).not.toContain('missing_image');
});
