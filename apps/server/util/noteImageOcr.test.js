import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearNoteImageOcrMemoryCache, recognizeNoteImages, resolveLocalNoteImage } from './noteImageOcr.js';

const tempDirs = [];

afterEach(async () => {
  clearNoteImageOcrMemoryCache();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function imageFixture(fileName = 'note-test.png') {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'light-note-note-ocr-'));
  tempDirs.push(dir);
  const buffer = Buffer.from('fake-image-content');
  await writeFile(path.join(dir, fileName), buffer);
  return { dir, buffer, url: `https://boluo66.top/uploads/${fileName}` };
}

describe('笔记内图片 OCR', () => {
  it('只允许本站 uploads 根目录下的受支持图片', () => {
    expect(resolveLocalNoteImage('https://boluo66.top/uploads/note-a.png', '/images')).toEqual({
      fileName: 'note-a.png',
      extension: '.png',
      filePath: '/images/note-a.png',
    });
    expect(resolveLocalNoteImage('http://boluo66.top/uploads/note-a.png', '/images')).toBeNull();
    expect(resolveLocalNoteImage('https://evil.example/uploads/note-a.png', '/images')).toBeNull();
    expect(resolveLocalNoteImage('https://boluo66.top/uploads/nested/note-a.png', '/images')).toBeNull();
    expect(resolveLocalNoteImage('https://boluo66.top/uploads/note-a.svg', '/images')).toBeNull();
  });

  it('必须同时出现在允许引用集合中才执行 OCR', async () => {
    const fixture = await imageFixture();
    const ocrProvider = { recognizeImage: vi.fn().mockResolvedValue({ content: '识别文字' }) };

    expect(
      await recognizeNoteImages([{ url: fixture.url }], {
        imageRoot: fixture.dir,
        allowedUrls: [],
        ocrProvider,
      }),
    ).toEqual([]);
    expect(ocrProvider.recognizeImage).not.toHaveBeenCalled();
  });

  it('复用现有图片 OCR 并缓存相同内容，避免重复启动识别进程', async () => {
    const fixture = await imageFixture();
    const ocrProvider = { recognizeImage: vi.fn().mockResolvedValue({ content: '图片里的计划内容' }) };
    const cache = {
      get: vi.fn().mockResolvedValue(null),
      setEx: vi.fn().mockResolvedValue('OK'),
    };

    const first = await recognizeNoteImages([{ url: fixture.url, alt: '计划截图', order: 1 }], {
      imageRoot: fixture.dir,
      allowedUrls: [fixture.url],
      ocrProvider,
      cache,
    });
    const second = await recognizeNoteImages([{ url: fixture.url, alt: '计划截图', order: 1 }], {
      imageRoot: fixture.dir,
      allowedUrls: [fixture.url],
      ocrProvider,
      cache,
    });

    expect(first).toEqual([expect.objectContaining({ status: 'success', content: '图片里的计划内容', cached: false })]);
    expect(second).toEqual([expect.objectContaining({ status: 'success', content: '图片里的计划内容', cached: true })]);
    expect(ocrProvider.recognizeImage).toHaveBeenCalledTimes(1);
    expect(cache.setEx).toHaveBeenCalledTimes(1);
  });

  it('单图失败不会阻断其他图片，且按顺序串行处理', async () => {
    const first = await imageFixture('note-first.png');
    const second = await imageFixture('note-second.jpg');
    const calls = [];
    const ocrProvider = {
      recognizeImage: vi.fn(async (_, { extension }) => {
        calls.push(extension);
        if (extension === '.png') throw Object.assign(new Error('识别失败'), { code: 'OCR_RECOGNITION_FAILED' });
        return { content: '第二张图文字' };
      }),
    };

    const result = await recognizeNoteImages(
      [
        { url: first.url, order: 1 },
        { url: second.url, order: 2 },
      ],
      {
        imageRoot: first.dir,
        // 两张图在不同临时目录，使用注入读取器模拟生产目录。
        readImage: async (filePath) => (filePath.endsWith('note-first.png') ? first.buffer : second.buffer),
        allowedUrls: [first.url, second.url],
        ocrProvider,
        cache: { get: vi.fn().mockResolvedValue(null), setEx: vi.fn().mockResolvedValue('OK') },
      },
    );

    expect(calls).toEqual(['.png', '.jpg']);
    expect(result[0]).toMatchObject({ status: 'failed', errorCode: 'OCR_RECOGNITION_FAILED' });
    expect(result[1]).toMatchObject({ status: 'success', content: '第二张图文字' });
  });
});
