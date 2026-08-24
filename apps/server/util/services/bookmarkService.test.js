import { beforeEach, describe, expect, it, vi } from 'vitest';

const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const pool = { getConnection: vi.fn(() => connection) };
const ensureTag = vi.fn();
const insertResourceTagRelations = vi.fn();
const validateUserTags = vi.fn();
const fetchWebMeta = vi.fn();
const triggerResourceCreateEffects = vi.fn();
const createIconBatch = vi.fn();
const archiveBookmarkBackground = vi.fn();

vi.mock('../../db/index.js', () => ({ default: pool }));
vi.mock('./tagService.js', () => ({ ensureTag }));
vi.mock('../resourceTags.js', () => ({
  RESOURCE_TYPE: { BOOKMARK: 'bookmark' },
  insertResourceTagRelations,
  validateUserTags,
}));
vi.mock('../resourceInbox.js', () => ({ enqueueResources: vi.fn() }));
vi.mock('../snapshot.js', () => ({ archiveBookmarkBackground }));
vi.mock('../bookmarkIconBatchService.js', () => ({ createIconBatch }));
vi.mock('../fetchWebMeta.js', () => ({
  EXPLICIT_WEB_READ_MAX_BYTES: 4 * 1024 * 1024,
  fetchWebMeta,
}));
vi.mock('./resourceCreateEffects.js', () => ({ triggerResourceCreateEffects }));

const { createBookmark, shouldResetBookmarkIcon } = await import('./bookmarkService.js');

describe('bookmarkService.shouldResetBookmarkIcon', () => {
  it('网址未变化时保留已有图标', () => {
    expect(shouldResetBookmarkIcon('https://example.com', 'https://example.com')).toBe(false);
    expect(shouldResetBookmarkIcon('example.com', 'https://example.com')).toBe(false);
    expect(shouldResetBookmarkIcon('https://example.com/old', 'https://example.com/new?from=edit')).toBe(false);
  });

  it('网址真正变化时清理旧图标', () => {
    expect(shouldResetBookmarkIcon('https://example.com', 'https://another.example.com')).toBe(true);
  });
});

describe('bookmarkService.createBookmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWebMeta.mockResolvedValue({ ok: false, reason: 'FETCH_FAILED' });
    triggerResourceCreateEffects.mockResolvedValue(undefined);
    createIconBatch.mockResolvedValue({ batchId: 'batch-1', total: 1, status: 'queued' });
    archiveBookmarkBackground.mockReturnValue(true);
    connection.beginTransaction.mockResolvedValue();
    connection.commit.mockResolvedValue();
    connection.rollback.mockResolvedValue();
    connection.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValue([{ affectedRows: 1 }]);
    validateUserTags.mockResolvedValue([]);
    ensureTag.mockResolvedValue({ id: 'tag-1', name: '资料', isNew: true });
    insertResourceTagRelations.mockResolvedValue(1);
  });

  it('书签、自动标签和关系在同一事务提交', async () => {
    const result = await createBookmark({
      userId: 'user-1',
      userRole: 'user',
      bookmark: { url: 'example.com', name: 'Example', description: 'desc' },
      tagNames: ['资料'],
      tagSource: 'agent',
      saveSnapshot: false,
      suppressUserRewards: true,
    });

    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ensureTag).toHaveBeenCalledWith({ userId: 'user-1', name: '资料', connection });
    expect(insertResourceTagRelations).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ tagIds: ['tag-1'], resourceId: result.id, source: 'agent' }),
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('无图标书签在主事务提交并释放连接后进入持久化补全队列', async () => {
    const result = await createBookmark({
      userId: 'user-1',
      bookmark: { url: 'https://example.com/path', name: 'Example' },
      saveSnapshot: false,
    });

    expect(createIconBatch).toHaveBeenCalledWith('user-1', [{ id: result.id, url: 'https://example.com/path' }]);
    expect(connection.commit.mock.invocationCallOrder[0]).toBeLessThan(createIconBatch.mock.invocationCallOrder[0]);
    expect(connection.release.mock.invocationCallOrder[0]).toBeLessThan(createIconBatch.mock.invocationCallOrder[0]);
  });

  it('书签已带图标时不创建后台补全任务', async () => {
    await createBookmark({
      userId: 'user-1',
      bookmark: {
        url: 'https://example.com/path',
        name: 'Example',
        iconUrl: '/uploads/bookmark-icon/existing.png',
      },
      saveSnapshot: false,
    });

    expect(createIconBatch).not.toHaveBeenCalled();
  });

  it('免费网页存档只在书签提交后进入有界后台队列', async () => {
    const result = await createBookmark({
      userId: 'user-1',
      bookmark: { url: 'https://example.com/path', name: 'Example' },
      saveSnapshot: true,
    });

    expect(archiveBookmarkBackground).toHaveBeenCalledWith('user-1', result.id);
    expect(connection.commit.mock.invocationCallOrder[0]).toBeLessThan(
      archiveBookmarkBackground.mock.invocationCallOrder[0],
    );
    expect(result.snapshotScheduled).toBe(true);
  });

  it('图标任务入队失败不把已提交的收藏伪装成失败', async () => {
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    createIconBatch.mockRejectedValueOnce(Object.assign(new Error('table unavailable'), { code: 'ER_NO_SUCH_TABLE' }));

    try {
      await expect(
        createBookmark({
          userId: 'user-1',
          bookmark: { url: 'https://example.com/path', name: 'Example' },
          saveSnapshot: false,
        }),
      ).resolves.toMatchObject({ name: 'Example', url: 'https://example.com/path' });
      expect(logSpy).toHaveBeenCalledWith('[bookmark-icon] 新书签补全任务创建失败 code=%s', 'ER_NO_SUCH_TABLE');
      expect(connection.rollback).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }
  });

  it('标签阶段失败时回滚整个收藏事务', async () => {
    ensureTag.mockRejectedValueOnce(new Error('tag insert failed'));
    await expect(
      createBookmark({
        userId: 'user-1',
        bookmark: { url: 'https://example.com', name: 'Example' },
        tagNames: ['资料'],
        saveSnapshot: false,
        suppressUserRewards: true,
      }),
    ).rejects.toThrow('tag insert failed');
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  it('用户主动让 Agent 补全书签信息时使用显式网页读取预算', async () => {
    fetchWebMeta.mockResolvedValueOnce({
      ok: true,
      title: '真实网页标题',
      description: '真实网页描述',
    });

    await createBookmark({
      userId: 'user-1',
      userRole: 'user',
      bookmark: { url: 'https://example.com/article' },
      fillMetadata: true,
      saveSnapshot: false,
      suppressUserRewards: true,
    });

    expect(fetchWebMeta).toHaveBeenCalledWith('https://example.com/article', {
      signal: undefined,
      maxContentBytes: 4 * 1024 * 1024,
    });
  });

  it('书签提交后旁路副作用同步失败仍返回成功', async () => {
    triggerResourceCreateEffects.mockImplementationOnce(() => {
      throw new ReferenceError('crypto is not defined');
    });

    await expect(
      createBookmark({
        userId: 'root-1',
        userRole: 'root',
        bookmark: { url: 'https://example.com/saved', name: '已保存书签' },
        saveSnapshot: false,
      }),
    ).resolves.toMatchObject({ name: '已保存书签', url: 'https://example.com/saved' });

    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it.each(['', 'javascript:alert(1)', 'https:// bad.example.com'])(
    '无效或待确认地址在取数据库连接前就被拒绝: %s',
    async (url) => {
      await expect(
        createBookmark({
          userId: 'user-1',
          bookmark: { url, name: 'Bad URL' },
          saveSnapshot: false,
        }),
      ).rejects.toThrow();
      expect(pool.getConnection).not.toHaveBeenCalled();
    },
  );
});
