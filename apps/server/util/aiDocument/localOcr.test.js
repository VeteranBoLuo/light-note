import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  inspectLocalOcrRuntime,
  inspectOcrImage,
  recognizeImageWithLocalOcr,
  recognizePdfWithLocalOcr,
} from './localOcr.js';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const tempRoots = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempRoot() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'light-note-ocr-test-'));
  tempRoots.push(dir);
  return dir;
}

describe('本地 OCR', () => {
  it('校验图片真实格式，拒绝扩展名伪装', () => {
    expect(inspectOcrImage(ONE_PIXEL_PNG, '.png')).toEqual({ width: 1, height: 1, type: 'png' });
    expect(() => inspectOcrImage(ONE_PIXEL_PNG, '.jpg')).toThrow(/FILE_CONTENT_INVALID/);
  });

  it('PDF 逐页渲染、串行识别并清理临时文件', async () => {
    const tempRoot = await createTempRoot();
    const runner = vi.fn(async (command, args) => {
      if (command === 'pdftoppm') {
        const pagePrefix = args.at(-1);
        await writeFile(`${pagePrefix}-1.png`, ONE_PIXEL_PNG);
        await writeFile(`${pagePrefix}-2.png`, ONE_PIXEL_PNG);
        return { stdout: '', stderr: '' };
      }
      return { stdout: args[0].endsWith('-1.png') ? '第一页文字' : 'Second page text', stderr: '' };
    });

    const pages = await recognizePdfWithLocalOcr(Buffer.from('%PDF-test'), {
      pageCount: 2,
      runner,
      tempRoot,
    });

    expect(pages).toEqual([
      { pageNumber: 1, content: '第一页文字' },
      { pageNumber: 2, content: 'Second page text' },
    ]);
    expect(runner.mock.calls.map(([command]) => command)).toEqual(['pdftoppm', 'tesseract', 'tesseract']);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it('图片直接识别并使用中英文模型', async () => {
    const tempRoot = await createTempRoot();
    const runner = vi.fn(async () => ({ stdout: '图片里的文字', stderr: '' }));

    await expect(recognizeImageWithLocalOcr(ONE_PIXEL_PNG, { extension: '.png', runner, tempRoot })).resolves.toEqual({
      content: '图片里的文字',
    });
    expect(runner).toHaveBeenCalledWith(
      'tesseract',
      expect.arrayContaining(['-l', 'chi_sim+eng']),
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it('运行时门禁同时检查 ImageMagick，避免预处理缺失却误报 OCR 已就绪', async () => {
    const runner = vi.fn(async (command) => {
      if (command === 'tesseract') return { stdout: 'List of available languages:\nchi_sim\neng\n', stderr: '' };
      return { stdout: '', stderr: '' };
    });
    await expect(inspectLocalOcrRuntime({ runner })).resolves.toMatchObject({
      ready: true,
      preprocessEnabled: true,
      preprocessReady: true,
    });
    expect(runner.mock.calls.map(([command]) => command)).toEqual(['tesseract', 'pdftoppm', 'convert']);

    const unavailable = vi.fn(async (command) => {
      if (command === 'convert') throw Object.assign(new Error('missing'), { code: 'OCR_ENGINE_UNAVAILABLE' });
      return command === 'tesseract' ? { stdout: 'chi_sim\neng\n', stderr: '' } : { stdout: '', stderr: '' };
    });
    await expect(inspectLocalOcrRuntime({ runner: unavailable })).resolves.toMatchObject({
      ready: false,
      preprocessReady: false,
      missingComponents: ['imagemagick'],
      errorCode: 'OCR_ENGINE_UNAVAILABLE',
    });
  });

  it('请求已取消时不再启动任何 OCR 子进程', async () => {
    const controller = new AbortController();
    const reason = Object.assign(new Error('cancelled'), { name: 'AbortError', code: 'AI_REQUEST_ABORTED' });
    controller.abort(reason);
    const runner = vi.fn();

    await expect(
      recognizeImageWithLocalOcr(ONE_PIXEL_PNG, {
        extension: '.png',
        runner,
        signal: controller.signal,
      }),
    ).rejects.toBe(reason);
    expect(runner).not.toHaveBeenCalled();
  });
});
