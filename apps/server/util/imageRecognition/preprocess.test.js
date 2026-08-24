import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareImagesForVision } from './preprocess.js';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const roots = [];

function pngWithDimensions(width, height) {
  const buffer = Buffer.from(ONE_PIXEL_PNG);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Vision 图片预处理', () => {
  it('ImageMagick 暂不可用时保留原图并明确标注，不让预处理故障阻断保底', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'light-note-vision-test-'));
    roots.push(root);
    const runner = vi.fn().mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const result = await prepareImagesForVision(ONE_PIXEL_PNG, { extension: '.png', runner, tempRoot: root });

    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({ mimeType: 'image/png', width: 1, height: 1, label: '原图' });
    expect(result.warnings).toContain('VISION_PREPROCESS_UNAVAILABLE');
    expect(await readdir(root)).toEqual([]);
  });

  it('拒绝扩展名与真实内容不一致的图片', async () => {
    await expect(prepareImagesForVision(ONE_PIXEL_PNG, { extension: '.jpg' })).rejects.toMatchObject({
      code: 'FILE_CONTENT_INVALID',
    });
  });

  it('大图保留自动旋转后的完整图，并生成两个带重叠的细节分区', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'light-note-vision-test-'));
    roots.push(root);
    const runner = vi.fn(async (_command, args) => {
      const outputPath = args.at(-1);
      await writeFile(
        outputPath,
        args.includes('-auto-orient') ? pngWithDimensions(1800, 1000) : pngWithDimensions(1044, 1000),
      );
      return { stdout: '', stderr: '' };
    });

    const result = await prepareImagesForVision(ONE_PIXEL_PNG, { extension: '.png', runner, tempRoot: root });

    expect(result.images.map((item) => item.label)).toEqual(['自动旋转后的完整图片', '左侧细节', '右侧细节']);
    expect(runner).toHaveBeenCalledTimes(3);
    expect(runner.mock.calls[0][1]).toEqual(expect.arrayContaining(['-auto-orient', '-strip', '-colorspace', 'sRGB']));
    expect(runner.mock.calls[1][1]).toEqual(expect.arrayContaining(['-crop', '1044x1000+0+0']));
    expect(runner.mock.calls[2][1]).toEqual(expect.arrayContaining(['-crop', '1044x1000+756+0']));
    expect(await readdir(root)).toEqual([]);
  });

  it('在启动 ImageMagick 前拒绝超过像素预算的压缩图片', async () => {
    const runner = vi.fn();
    await expect(
      prepareImagesForVision(pngWithDimensions(6000, 5000), { extension: '.png', runner }),
    ).rejects.toMatchObject({ code: 'OCR_IMAGE_TOO_LARGE' });
    expect(runner).not.toHaveBeenCalled();
  });
});
