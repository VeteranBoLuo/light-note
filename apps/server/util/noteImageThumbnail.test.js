import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const imageSize = vi.hoisted(() => vi.fn());
vi.mock('image-size', () => ({ imageSize }));

const {
  clearNoteImageThumbnailRuntimeState,
  deleteNoteImageThumbnail,
  ensureNoteImageThumbnail,
  noteImageThumbnailPathname,
  resolveOwnedNoteThumbnailSource,
  thumbnailKeyForNoteImageUrl,
} = await import('./noteImageThumbnail.js');

const temporaryDirectories = [];
const sourceUrl = 'https://boluo66.top/uploads/note-preview.png';

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'light-note-thumb-test-'));
  temporaryDirectories.push(root);
  const imageRoot = path.join(root, 'images');
  const thumbnailRoot = path.join(root, 'thumbnails');
  await fs.mkdir(imageRoot);
  await fs.writeFile(path.join(imageRoot, 'note-preview.png'), Buffer.from('source-image'));
  const runner = vi.fn(async (_bin, args) => {
    await fs.writeFile(args.at(-1), Buffer.from('webp-thumbnail'));
    return { stdout: '', stderr: '' };
  });
  return { imageRoot, thumbnailRoot, runner };
}

describe('笔记卡片缩略图', () => {
  beforeEach(() => {
    clearNoteImageThumbnailRuntimeState();
    imageSize.mockImplementation((buffer) =>
      buffer.toString() === 'source-image'
        ? { type: 'png', width: 1600, height: 900 }
        : { type: 'webp', width: 720, height: 405 },
    );
  });

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
    );
  });

  it('生成 720px WebP 并让同一冷图请求复用单并发任务', async () => {
    const { imageRoot, thumbnailRoot, runner } = await fixture();
    const [first, second] = await Promise.all([
      ensureNoteImageThumbnail(sourceUrl, { imageRoot, thumbnailRoot, runner }),
      ensureNoteImageThumbnail(sourceUrl, { imageRoot, thumbnailRoot, runner }),
    ]);
    expect(first).toBe(second);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][1]).toEqual(
      expect.arrayContaining(['-thumbnail', '720x720>', '-quality', '76', '-define', 'webp:method=4']),
    );
    await expect(fs.readFile(first, 'utf8')).resolves.toBe('webp-thumbnail');
  });

  it('缩略图 URL 绑定源文件哈希，归属查询使用精确 URL', async () => {
    const key = thumbnailKeyForNoteImageUrl(sourceUrl);
    const pathname = noteImageThumbnailPathname(sourceUrl);
    expect(pathname).toContain(`/api/note/image-thumbnail/${key}.webp?source=`);
    const db = {
      query: vi.fn(async () => [[{ url: sourceUrl }]]),
    };
    await expect(resolveOwnedNoteThumbnailSource({ key, sourceUrl, userId: 'u1', db })).resolves.toBe(sourceUrl);
    expect(db.query.mock.calls[0][0]).toContain('WHERE ni.url IN (');
    expect(db.query.mock.calls[0][1]).toEqual(expect.arrayContaining([sourceUrl, 'u1']));
    await expect(
      resolveOwnedNoteThumbnailSource({ key: `${'0'.repeat(64)}`, sourceUrl, userId: 'u1', db }),
    ).resolves.toBe('');
  });

  it('删除原图时可以同步删除派生缩略图', async () => {
    const { imageRoot, thumbnailRoot, runner } = await fixture();
    const generated = await ensureNoteImageThumbnail(sourceUrl, { imageRoot, thumbnailRoot, runner });
    await expect(deleteNoteImageThumbnail(sourceUrl, { thumbnailRoot })).resolves.toBe(true);
    await expect(fs.access(generated)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
