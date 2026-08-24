import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanupOtherDrawingThumbnailRevisions,
  decodeDrawingThumbnailDataUrl,
  drawingThumbnailFileName,
  drawingThumbnailPath,
  getExistingDrawingThumbnailPath,
  resolveDefaultDrawingThumbnailDir,
  saveDrawingThumbnail,
} from './drawingThumbnailImage.js';

const temporaryRoots = [];

// 1×1 VP8L 不是产品要求尺寸，用来验证维度门禁；正式 480×270 样本通过测试内最小 VP8X 头构造。
function webp(width, height) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(22, 4);
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8X', 12, 'ascii');
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('drawingThumbnailImage', () => {
  it('生产目录不存在时默认使用服务端可写运行时目录，并允许环境变量覆盖', () => {
    expect(resolveDefaultDrawingThumbnailDir({ productionRootExists: true })).toBe(
      '/www/wwwroot/drawing-note-thumbnails',
    );
    expect(resolveDefaultDrawingThumbnailDir({ productionRootExists: false })).toBe(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.runtime/drawing-note-thumbnails'),
    );
    expect(
      resolveDefaultDrawingThumbnailDir({
        configured: './custom-drawing-thumbnails',
        productionRootExists: false,
      }),
    ).toBe(path.resolve('./custom-drawing-thumbnails'));
  });

  it('只接受 480×270 且大小受限的 WebP data URL', () => {
    const valid = webp(480, 270);
    expect(decodeDrawingThumbnailDataUrl(`data:image/webp;base64,${valid.toString('base64')}`)).toEqual(valid);
    expect(decodeDrawingThumbnailDataUrl(`data:image/webp;base64,${webp(1, 1).toString('base64')}`)).toBeNull();
    expect(decodeDrawingThumbnailDataUrl('data:image/png;base64,AAAA')).toBeNull();
  });

  it('只原子保存当前渲染器版本，并清理旧正文与旧渲染器派生图', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'drawing-thumbnail-test-'));
    temporaryRoots.push(root);
    const image = webp(480, 270);
    await fs.writeFile(drawingThumbnailPath({ userId: 'u1', noteId: 'n1', revision: 2, rendererVersion: 2, root }), image);
    await fs.writeFile(drawingThumbnailPath({ userId: 'u1', noteId: 'n1', revision: 3, rendererVersion: 2, root }), image);
    await saveDrawingThumbnail({ userId: 'u1', noteId: 'n1', revision: 3, rendererVersion: 3, image }, { root });
    await cleanupOtherDrawingThumbnailRevisions(
      { userId: 'u1', noteId: 'n1', keepRevision: 3, keepRendererVersion: 3 },
      { root },
    );

    expect(
      await getExistingDrawingThumbnailPath({ userId: 'u1', noteId: 'n1', revision: 2, rendererVersion: 2 }, { root }),
    ).toBeNull();
    expect(
      await getExistingDrawingThumbnailPath({ userId: 'u1', noteId: 'n1', revision: 3, rendererVersion: 2 }, { root }),
    ).toBeNull();
    expect(await getExistingDrawingThumbnailPath({ userId: 'u1', noteId: 'n1', revision: 3 }, { root })).toBe(
      path.join(root, drawingThumbnailFileName({ userId: 'u1', noteId: 'n1', revision: 3 })),
    );
  });

  it('持久化层拒绝旧渲染器版本', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'drawing-thumbnail-test-'));
    temporaryRoots.push(root);
    const image = webp(480, 270);

    await expect(
      saveDrawingThumbnail({ userId: 'u1', noteId: 'n1', revision: 3, rendererVersion: 2, image }, { root }),
    ).rejects.toMatchObject({ code: 'DRAWING_THUMBNAIL_RENDERER_STALE' });
  });
});
