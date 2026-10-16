import { beforeEach, describe, expect, it, vi } from 'vitest';

const connection = {
  beginTransaction: vi.fn(),
  query: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
};
const pool = { getConnection: vi.fn(() => connection), query: vi.fn() };
const ensureTag = vi.fn();
const insertResourceTagRelations = vi.fn();
const validateUserTags = vi.fn();
const enqueueResources = vi.fn();
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
vi.mock('../resourceInbox.js', () => ({ enqueueResources }));
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
    pool.query.mockResolvedValue([[]]);
    enqueueResources.mockResolvedValue({ added: 1, reopened: 0, ignored: 0 });
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
    const bookmarkInsert = connection.query.mock.calls.find(([sql]) => sql === 'INSERT INTO bookmark SET ?');
    expect(bookmarkInsert?.[1]?.[0]?.url_exact_hash).toBeInstanceOf(Buffer);
    expect(bookmarkInsert?.[1]?.[0]?.url_exact_hash).toHaveLength(32);
  });

  it('浏览器插件可在同一事务匹配既有标签并创建用户确认的新标签', async () => {
    validateUserTags.mockResolvedValueOnce(['tag-existing']);
    const result = await createBookmark({
      userId: 'user-1',
      bookmark: { url: 'https://example.com/article', name: '文章' },
      tagIds: ['tag-existing'],
      tagNames: ['新标签', '新标签'],
      tagSource: 'browser_extension',
      addToInbox: true,
      inboxSource: 'browser_extension',
      saveSnapshot: false,
    });

    expect(insertResourceTagRelations).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ tagIds: ['tag-existing', 'tag-1'], source: 'browser_extension' }),
    );
    expect(enqueueResources).toHaveBeenCalledWith(connection, {
      userId: 'user-1',
      items: [{ resourceType: 'bookmark', resourceId: result.id }],
      source: 'browser_extension',
    });
  });

  it('重复网址返回可供插件打开已有资源的结构化结果', async () => {
    connection.query.mockReset();
    connection.query.mockResolvedValueOnce([[{ id: 'bookmark-1', name: '已有收藏' }]]);

    await expect(
      createBookmark({
        userId: 'user-1',
        bookmark: { url: 'https://example.com', name: '新名称' },
        saveSnapshot: false,
      }),
    ).rejects.toMatchObject({
      code: 'DUPLICATE_URL',
      httpStatus: 409,
      details: {
        duplicate: { id: 'bookmark-1', name: '已有收藏', url: 'https://example.com' },
      },
    });
  });

  it('默认入口遇到同名书签仍报同名冲突', async () => {
    connection.query.mockReset();
    connection.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ id: 'bookmark-1' }]]);

    await expect(
      createBookmark({
        userId: 'user-1',
        bookmark: { url: 'https://example.com/b', name: 'example.com' },
        saveSnapshot: false,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_NAME', httpStatus: 409 });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  it('快速添加的同名书签按序号避让，比较不区分大小写并转义通配符', async () => {
    connection.query.mockReset();
    connection.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 'bookmark-1' }]])
      .mockResolvedValueOnce([[{ name: 'Ex_ample.com (2)' }]])
      .mockResolvedValue([{ affectedRows: 1 }]);

    const result = await createBookmark({
      userId: 'user-1',
      bookmark: { url: 'https://ex_ample.com/b', name: 'ex_ample.com' },
      addToInbox: true,
      inboxSource: 'system_share',
      saveSnapshot: false,
      suffixDuplicateName: true,
    });

    const likeQuery = connection.query.mock.calls.find(([sql]) => String(sql).includes('name LIKE ?'));
    expect(likeQuery?.[1]).toEqual(['user-1', 'ex\\_ample.com (%)']);
    const bookmarkInsert = connection.query.mock.calls.find(([sql]) => sql === 'INSERT INTO bookmark SET ?');
    expect(bookmarkInsert?.[1]?.[0]?.name).toBe('ex_ample.com (3)');
    expect(enqueueResources).toHaveBeenCalledWith(connection, {
      userId: 'user-1',
      items: [{ resourceType: 'bookmark', resourceId: result.id }],
      source: 'system_share',
    });
  });

  it('同一幂等键重试直接恢复固定书签，不重复触发图标、快照或成长副作用', async () => {
    pool.query.mockResolvedValueOnce([
      [{ id: '1b1ce0ca-0ac7-5d70-a03f-a3cf782253b8', name: '已保存', url: 'https://example.com/' }],
    ]);

    const result = await createBookmark({
      userId: 'user-1',
      bookmark: { url: 'https://example.com', name: '已保存' },
      idempotencyKey: 'browser-extension:retry-1',
      addToInbox: true,
      captureMetadata: true,
    });

    expect(result).toMatchObject({ idempotentReplay: true, addedToInbox: true, snapshotScheduled: false });
    expect(pool.getConnection).not.toHaveBeenCalled();
    expect(fetchWebMeta).not.toHaveBeenCalled();
    expect(createIconBatch).not.toHaveBeenCalled();
    expect(archiveBookmarkBackground).not.toHaveBeenCalled();
    expect(triggerResourceCreateEffects).not.toHaveBeenCalled();
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
      renderFallback: true,
    });
  });

  it('快速添加优先用网页标题和描述，在借出数据库连接前完成有时限的轻量读取', async () => {
    fetchWebMeta.mockResolvedValueOnce({ ok: true, title: '  一篇具体的文章  ', description: '  文章简介  ' });
    await createBookmark({
      userId: 'user-1',
      bookmark: { url: 'https://example.com/a', name: '分享标题' },
      captureMetadata: true,
      saveSnapshot: false,
    });

    expect(fetchWebMeta).toHaveBeenCalledWith('https://example.com/a', {
      signal: expect.any(AbortSignal), timeout: 5000, renderFallback: false,
    });
    expect(fetchWebMeta.mock.invocationCallOrder[0]).toBeLessThan(pool.getConnection.mock.invocationCallOrder[0]);
    const inserted = connection.query.mock.calls.find(([sql]) => sql === 'INSERT INTO bookmark SET ?')?.[1]?.[0];
    expect(inserted).toMatchObject({ name: '一篇具体的文章', description: '文章简介' });
  });

  it.each(['ACCESS_DENIED', 'AUTH_REQUIRED', 'TIMEOUT', 'JS_RENDER_REQUIRED'])(
    '快速添加读取失败 %s 时保留分享标题，未获取的描述留空', async (reason) => {
      fetchWebMeta.mockResolvedValueOnce({ ok: false, reason, title: '登录或验证页', description: '不能作为收藏描述' });
      const result = await createBookmark({
        userId: 'user-1',
        bookmark: { url: 'https://example.com/a', name: '分享的文章标题' },
        captureMetadata: true,
        saveSnapshot: false,
      });
      expect(result.name).toBe('分享的文章标题');
      const inserted = connection.query.mock.calls.find(([sql]) => sql === 'INSERT INTO bookmark SET ?')?.[1]?.[0];
      expect(inserted.description).toBe('');
    },
  );

  it('快速添加抓取异常且没有分享标题时仍以域名保存', async () => {
    fetchWebMeta.mockRejectedValueOnce(new Error('network failure'));
    await expect(createBookmark({
      userId: 'user-1', bookmark: { url: 'https://www.example.com/a' },
      captureMetadata: true, saveSnapshot: false,
    })).resolves.toMatchObject({ name: 'example.com' });
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('网页只有描述时保留分享标题，且入库字段遵守长度上限', async () => {
    fetchWebMeta.mockResolvedValueOnce({ ok: true, title: ' ', description: '介绍'.repeat(200) });
    await createBookmark({
      userId: 'user-1', bookmark: { url: 'https://example.com/a', name: '标题'.repeat(200) },
      captureMetadata: true, saveSnapshot: false,
    });
    const inserted = connection.query.mock.calls.find(([sql]) => sql === 'INSERT INTO bookmark SET ?')?.[1]?.[0];
    expect(inserted.name).toBe('标题'.repeat(200).slice(0, 255));
    expect(inserted.description).toBe('介绍'.repeat(200).slice(0, 255));
  });

  it('抓取出的标题同名时仍按序号避让', async () => {
    fetchWebMeta.mockResolvedValueOnce({ ok: true, title: '文章', description: '简介' });
    connection.query.mockReset();
    connection.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ id: 'existing' }]])
      .mockResolvedValueOnce([[{ name: '文章 (2)' }]]).mockResolvedValue([{ affectedRows: 1 }]);
    await expect(createBookmark({
      userId: 'user-1', bookmark: { url: 'https://example.com/a', name: 'example.com' },
      captureMetadata: true, suffixDuplicateName: true, saveSnapshot: false,
    })).resolves.toMatchObject({ name: '文章 (3)' });
  });

  it('重复收集仍返回已有书签并加入待整理，不用抓取结果覆盖用户已编辑的信息', async () => {
    fetchWebMeta.mockResolvedValueOnce({ ok: true, title: '网页标题', description: '网页简介' });
    connection.query.mockReset();
    connection.query.mockResolvedValueOnce([[{ id: 'existing', name: '用户整理后的名称' }]]);
    const result = await createBookmark({
      userId: 'user-1', bookmark: { url: 'https://example.com/a', name: 'example.com' },
      captureMetadata: true, addToInbox: true, duplicateToInbox: true,
    });
    expect(result).toMatchObject({ id: 'existing', name: '用户整理后的名称', duplicate: true, addedToInbox: true });
    expect(enqueueResources).toHaveBeenCalledWith(connection, {
      userId: 'user-1', items: [{ resourceType: 'bookmark', resourceId: 'existing' }], source: 'duplicate_requeue',
    });
    expect(connection.query.mock.calls.some(([sql]) => /^(?:INSERT|UPDATE)\b/.test(sql))).toBe(false);
    expect(archiveBookmarkBackground).not.toHaveBeenCalled();
  });

  it('总时限结束会终止慢网页读取并继续保存', async () => {
    vi.useFakeTimers();
    try {
      fetchWebMeta.mockImplementationOnce((_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      }));
      const pending = createBookmark({
        userId: 'user-1', bookmark: { url: 'https://example.com/a' },
        captureMetadata: true, saveSnapshot: false,
      });
      await vi.advanceTimersByTimeAsync(5000);
      await expect(pending).resolves.toMatchObject({ name: 'example.com' });
      expect(fetchWebMeta.mock.calls[0][1].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('调用方取消不会被当作网页读取失败而继续创建书签', async () => {
    const controller = new AbortController();
    fetchWebMeta.mockImplementationOnce(() => {
      controller.abort();
      return Promise.reject(controller.signal.reason);
    });
    await expect(createBookmark({
      userId: 'user-1', bookmark: { url: 'https://example.com/a' },
      captureMetadata: true, signal: controller.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('普通手填保存不抓取，也不覆盖用户名称和描述', async () => {
    await createBookmark({
      userId: 'user-1', bookmark: { url: 'https://example.com/a', name: '我的名称', description: '我的描述' },
      saveSnapshot: false,
    });
    expect(fetchWebMeta).not.toHaveBeenCalled();
    const inserted = connection.query.mock.calls.find(([sql]) => sql === 'INSERT INTO bookmark SET ?')?.[1]?.[0];
    expect(inserted).toMatchObject({ name: '我的名称', description: '我的描述' });
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
