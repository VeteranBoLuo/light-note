import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  pool: {
    query: vi.fn(),
  },
  acquire: vi.fn(),
  fetchFaviconFromApi: vi.fn(),
  normalizeOrigin: vi.fn(),
  isRetryableError: vi.fn(() => false),
  isPermanentError: vi.fn(() => false),
}));

vi.mock('../db/index.js', () => ({ default: mocks.pool }));
vi.mock('./bookmarkIconLimiter.js', () => ({
  bookmarkIconLimiter: { acquire: mocks.acquire },
}));
vi.mock('./bookmarkIconClient.js', () => ({
  fetchFaviconFromApi: mocks.fetchFaviconFromApi,
  normalizeOrigin: mocks.normalizeOrigin,
  isRetryableError: mocks.isRetryableError,
  isPermanentError: mocks.isPermanentError,
}));

const previousUploadDir = process.env.BOOKMARK_ICON_UPLOAD_DIR;
const uploadDir = await mkdtemp(path.join(tmpdir(), 'light-note-bookmark-icon-service-'));
process.env.BOOKMARK_ICON_UPLOAD_DIR = uploadDir;

const { cleanupBookmarkIconFiles, cleanupPreviousBookmarkIcon, processBookmarkIcons, saveIconToDisk } =
  await import('./bookmarkIconService.js');

async function resetUploadDir() {
  const entries = await readdir(uploadDir);
  await Promise.all(entries.map((entry) => rm(path.join(uploadDir, entry), { recursive: true, force: true })));
}

describe('bookmarkIconService 内容寻址与清理', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.pool.query.mockResolvedValue([[]]);
    mocks.acquire.mockResolvedValue(vi.fn());
    mocks.isRetryableError.mockReturnValue(false);
    mocks.isPermanentError.mockImplementation((code) => ['INVALID_URL', 'PRIVATE_ADDRESS'].includes(code));
    await resetUploadDir();
  });

  afterAll(async () => {
    await rm(uploadDir, { recursive: true, force: true });
    if (previousUploadDir === undefined) {
      delete process.env.BOOKMARK_ICON_UPLOAD_DIR;
    } else {
      process.env.BOOKMARK_ICON_UPLOAD_DIR = previousUploadDir;
    }
  });

  it('相同内容的不同书签复用同一个共享文件', async () => {
    const buffer = Buffer.from('same favicon bytes');
    const fetchResult = { buffer, contentType: 'image/png' };

    const first = await saveIconToDisk({ id: 'bookmark-1', icon_url: '' }, fetchResult);
    const second = await saveIconToDisk({ id: 'bookmark-2', icon_url: '' }, fetchResult);
    const files = (await readdir(uploadDir)).filter((name) => !name.startsWith('.'));

    expect(first.iconUrl).toBe(second.iconUrl);
    expect(first.iconUrl).toMatch(/^\/uploads\/bookmark-icon-[a-f0-9]{64}\.png$/);
    expect(files).toEqual([path.basename(first.iconUrl)]);
    await expect(readFile(first.newFilePath)).resolves.toEqual(buffer);
  });

  it('旧版书签文件会迁移到共享文件，并在无引用后删除旧文件', async () => {
    const buffer = Buffer.from('legacy favicon bytes');
    const oldFileName = 'bookmark-bookmark-1-123456abcdef.ico';
    const oldFilePath = path.join(uploadDir, oldFileName);
    await writeFile(oldFilePath, buffer);

    const saved = await saveIconToDisk(
      { id: 'bookmark-1', icon_url: `/uploads/${oldFileName}` },
      { buffer, contentType: 'image/x-icon' },
    );

    expect(saved.changed).toBe(true);
    expect(saved.oldFilePath).toBe(oldFilePath);
    await cleanupPreviousBookmarkIcon(`/uploads/${oldFileName}`, 'bookmark-1', saved.iconUrl);

    await expect(readFile(oldFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(saved.newFilePath)).resolves.toEqual(buffer);
  });

  it('共享文件仍有活动书签引用时保留，最后一个引用消失后才删除', async () => {
    const saved = await saveIconToDisk(
      { id: 'bookmark-1', icon_url: '' },
      { buffer: Buffer.from('shared favicon bytes'), contentType: 'image/png' },
    );

    mocks.pool.query.mockResolvedValueOnce([[{ icon_url: saved.iconUrl }]]);
    await expect(cleanupBookmarkIconFiles([{ id: 'bookmark-1', iconUrl: saved.iconUrl }])).resolves.toMatchObject({
      deleted: 0,
      kept: 1,
    });
    await expect(readFile(saved.newFilePath)).resolves.toBeInstanceOf(Buffer);

    mocks.pool.query.mockResolvedValueOnce([[]]);
    await expect(cleanupBookmarkIconFiles([{ id: 'bookmark-1', iconUrl: saved.iconUrl }])).resolves.toMatchObject({
      deleted: 1,
      kept: 0,
    });
    await expect(readFile(saved.newFilePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('远端内容与现有共享图标一致时仍推进检查时间', async () => {
    const buffer = Buffer.from('unchanged favicon bytes'.repeat(4));
    const saved = await saveIconToDisk(
      { id: 'bookmark-1', icon_url: '' },
      { buffer, contentType: 'image/png' },
    );
    mocks.normalizeOrigin.mockReturnValue('https://example.com');
    mocks.fetchFaviconFromApi.mockResolvedValue({
      ok: true,
      buffer,
      contentType: 'image/png',
    });
    mocks.pool.query.mockResolvedValue([{ affectedRows: 1 }]);

    const results = await processBookmarkIcons([
      {
        id: 'bookmark-1',
        url: 'https://example.com/path',
        icon_url: saved.iconUrl,
        icon_checked_at: null,
      },
    ], 'user-1');

    expect(results[0]).toMatchObject({
      id: 'bookmark-1',
      iconUrl: saved.iconUrl,
      changed: false,
      checked: true,
    });
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SET icon_checked_at=NOW()'),
      ['bookmark-1', 'user-1'],
    );
  });

  it('无效 URL 会写入永久失败检查时间，避免每次刷新重复请求', async () => {
    mocks.normalizeOrigin.mockReturnValue(null);
    mocks.pool.query.mockResolvedValue([{ affectedRows: 1 }]);

    const results = await processBookmarkIcons([
      { id: 'bookmark-invalid', url: 'invalid url', icon_url: '', icon_checked_at: null },
    ], 'user-1');

    expect(results[0]).toMatchObject({
      id: 'bookmark-invalid',
      changed: false,
      errorCode: 'INVALID_URL',
    });
    expect(mocks.fetchFaviconFromApi).not.toHaveBeenCalled();
    expect(mocks.pool.query).toHaveBeenCalledWith(
      expect.stringContaining('SET icon_checked_at=NOW()'),
      ['bookmark-invalid', 'user-1'],
    );
  });

  it('短重试失败后使用第二次结果分类，避免保留已经过时的可重试状态', async () => {
    mocks.normalizeOrigin.mockReturnValue('https://example.com');
    mocks.fetchFaviconFromApi
      .mockResolvedValueOnce({ ok: false, errorCode: 'UPSTREAM_TIMEOUT', retryable: true })
      .mockResolvedValueOnce({ ok: false, errorCode: 'ICON_NOT_FOUND', retryable: false });
    mocks.isRetryableError.mockImplementation((code) => code === 'UPSTREAM_TIMEOUT');
    mocks.pool.query.mockResolvedValue([{ affectedRows: 1 }]);
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback) => {
      callback();
      return 0;
    });

    try {
      const results = await processBookmarkIcons([
        { id: 'bookmark-retry', url: 'https://example.com/path', icon_url: '', icon_checked_at: null },
      ], 'user-1');

      expect(mocks.fetchFaviconFromApi).toHaveBeenCalledTimes(2);
      expect(results[0]).toMatchObject({
        id: 'bookmark-retry',
        changed: false,
        errorCode: 'ICON_NOT_FOUND',
      });
      expect(mocks.pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SET icon_checked_at=NOW()'),
        ['bookmark-retry', 'user-1'],
      );
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});
