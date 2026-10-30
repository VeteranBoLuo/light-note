import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocks = vi.hoisted(() => ({
  pool: {
    getConnection: vi.fn(),
    query: vi.fn(),
  },
  fetchFaviconFromApi: vi.fn(),
  saveIconToDisk: vi.fn(),
  cleanupBookmarkIconFiles: vi.fn(),
  cleanupPreviousBookmarkIcon: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: mocks.pool }));
vi.mock('./bookmarkIconClient.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchFaviconFromApi: mocks.fetchFaviconFromApi,
}));
vi.mock('./bookmarkIconService.js', () => ({
  saveIconToDisk: mocks.saveIconToDisk,
  cleanupBookmarkIconFiles: mocks.cleanupBookmarkIconFiles,
  cleanupPreviousBookmarkIcon: mocks.cleanupPreviousBookmarkIcon,
}));

const { claimTasks, processTaskBatch, updateTaskResult } = await import('./bookmarkIconWorkerService.js');

function createConnection(queryResults = []) {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(),
    queryResults,
  };
}

describe('bookmark icon worker result updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cleanupBookmarkIconFiles.mockResolvedValue(undefined);
    mocks.cleanupPreviousBookmarkIcon.mockResolvedValue(undefined);
  });

  it.each([
    ['DNS_ERROR', 'not_found'],
    ['UPSTREAM_TIMEOUT', 'not_found'],
    ['UPSTREAM_ERROR', 'not_found'],
    ['INTERNAL_ERROR', 'failed'],
    ['QUEUE_FULL', 'failed'],
    ['SERVICE_UNAVAILABLE', 'failed'],
    ['SERVICE_TIMEOUT', 'failed'],
    ['SERVICE_PROTOCOL_ERROR', 'failed'],
    ['UNRECOGNIZED_FAILURE', 'failed'],
  ])('exhausted %s ends as %s and preserves its original cause', async (errorCode, status) => {
    const url = 'https://example.com/page';
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[{ id: 9 }]])
      .mockResolvedValueOnce([[{ url }]])
      .mockResolvedValue([{ affectedRows: 1 }]);
    mocks.pool.getConnection.mockResolvedValue(connection);
    await updateTaskResult(
      {
        id: 9,
        bookmark_id: 'bookmark-1',
        user_id: 'owner',
        url_hash: createHash('sha256').update(url).digest('hex'),
        attempts: 3,
      },
      { ok: false, errorCode },
      'worker-1',
    );
    expect(connection.query.mock.calls[3][1]).toEqual([status, 4, errorCode, 9, 'owner', 'worker-1']);
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('continues bounded retries for a transient target error before exhaustion', async () => {
    mocks.pool.query.mockResolvedValue([{ affectedRows: 1 }]);
    await updateTaskResult({ id: 8, user_id: 'owner', attempts: 0 }, { ok: false, errorCode: 'DNS_ERROR' }, 'worker-1');
    expect(mocks.pool.getConnection).not.toHaveBeenCalled();
    expect(mocks.pool.query.mock.calls[0][1]).toEqual([1, expect.any(Date), 'DNS_ERROR', 8, 'owner', 'worker-1']);
  });

  it('成功写回时用 URL 条件更新书签，并与 job success 在同一事务', async () => {
    const verifyConnection = createConnection();
    verifyConnection.query.mockResolvedValueOnce([
      [
        {
          id: 'bookmark-1',
          url: 'https://example.com/new',
          icon_url: '/uploads/old.png',
          del_flag: 0,
        },
      ],
    ]);
    const updateConnection = createConnection();
    updateConnection.query
      .mockResolvedValueOnce([[{ status: 'processing', locked_by: 'worker-1' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    mocks.pool.getConnection.mockResolvedValueOnce(verifyConnection).mockResolvedValueOnce(updateConnection);
    mocks.saveIconToDisk.mockResolvedValue({
      iconUrl: '/uploads/new.png',
      oldIconUrl: '/uploads/old.png',
      oldFilePath: '/www/wwwroot/images/old.png',
      newFilePath: '/www/wwwroot/images/new.png',
    });

    await updateTaskResult(
      {
        id: 1,
        bookmark_id: 'bookmark-1',
        user_id: 'user-1',
        url_snapshot: 'https://example.com/new',
        url_hash: 'unused-after-exact-url-check',
        attempts: 0,
      },
      {
        ok: true,
        buffer: Buffer.alloc(64, 1),
        contentType: 'image/png',
      },
      'worker-1',
    );

    const bookmarkUpdate = updateConnection.query.mock.calls[1];
    expect(bookmarkUpdate[0]).toContain('AND url = ?');
    expect(bookmarkUpdate[1]).toEqual(['/uploads/new.png', 'bookmark-1', 'user-1', 'https://example.com/new']);
    expect(updateConnection.commit).toHaveBeenCalledOnce();
    expect(mocks.cleanupPreviousBookmarkIcon).toHaveBeenCalledWith(
      '/uploads/old.png',
      'bookmark-1',
      '/uploads/new.png',
    );
  });

  it('URL 在落盘后变化时取消 job，不把旧 URL 图标写回书签', async () => {
    const verifyConnection = createConnection();
    verifyConnection.query.mockResolvedValueOnce([
      [
        {
          id: 'bookmark-1',
          url: 'https://example.com/old',
          icon_url: '',
          del_flag: 0,
        },
      ],
    ]);
    const updateConnection = createConnection();
    updateConnection.query
      .mockResolvedValueOnce([[{ status: 'processing', locked_by: 'worker-1' }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    mocks.pool.getConnection.mockResolvedValueOnce(verifyConnection).mockResolvedValueOnce(updateConnection);
    mocks.saveIconToDisk.mockResolvedValue({
      iconUrl: '/uploads/new.png',
      oldIconUrl: '',
      oldFilePath: '',
      newFilePath: '/www/wwwroot/images/new.png',
    });

    await updateTaskResult(
      {
        id: 2,
        bookmark_id: 'bookmark-1',
        user_id: 'user-1',
        url_snapshot: 'https://example.com/old',
        url_hash: 'unused-after-exact-url-check',
        attempts: 0,
      },
      {
        ok: true,
        buffer: Buffer.alloc(64, 1),
        contentType: 'image/png',
      },
      'worker-1',
    );

    expect(updateConnection.query.mock.calls[2][0]).toContain("status = 'cancelled'");
    expect(updateConnection.commit).toHaveBeenCalledOnce();
    expect(mocks.cleanupPreviousBookmarkIcon).not.toHaveBeenCalled();
    expect(mocks.cleanupBookmarkIconFiles).toHaveBeenCalledWith([{ id: 'bookmark-1', iconUrl: '/uploads/new.png' }]);
    expect(updateConnection.release.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cleanupBookmarkIconFiles.mock.invocationCallOrder[0],
    );
  });
});

describe('bookmark icon worker batch processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('前台已经补好图标时直接完成任务，不重复请求 favicon 服务', async () => {
    mocks.pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[]]);

    const result = await processTaskBatch(
      [
        {
          id: 7,
          bookmark_id: 'bookmark-1',
          user_id: 'user-1',
          url_snapshot: 'https://example.com/path',
          origin_key: 'https://example.com',
          attempts: 0,
        },
      ],
      'worker-1',
    );

    expect(result).toEqual({ processed: 1 });
    expect(mocks.pool.query.mock.calls[0][0]).toContain("b.icon_url <> ''");
    expect(mocks.pool.query.mock.calls[0][0]).toContain('b.url = j.url_snapshot');
    expect(mocks.pool.query.mock.calls[0][1]).toEqual([7, 'worker-1']);
    expect(mocks.fetchFaviconFromApi).not.toHaveBeenCalled();
  });
});

describe('bookmark icon worker claiming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('空闲时只读不写：没有超时任务也没有到期任务就不执行任何 UPDATE', async () => {
    const connection = createConnection();
    connection.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
    mocks.pool.getConnection.mockResolvedValue(connection);

    expect(await claimTasks('worker-1', 10, 3)).toEqual([]);
    expect(connection.query).toHaveBeenCalledTimes(2);
    for (const [sql] of connection.query.mock.calls) expect(sql).not.toMatch(/^\s*UPDATE/u);
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('可领取到期 retry_wait，并恢复超时 processing', async () => {
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[{ id: 4 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([
        [
          {
            id: 5,
            status: 'retry_wait',
            available_at: new Date(),
          },
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    mocks.pool.getConnection.mockResolvedValue(connection);

    const rows = await claimTasks('worker-1', 10, 3);

    expect(rows).toHaveLength(1);
    expect(connection.query.mock.calls[0][0]).toMatch(/^\s*SELECT id FROM bookmark_icon_jobs/u);
    expect(connection.query.mock.calls[1][0]).toMatch(/^\s*UPDATE bookmark_icon_jobs[\s\S]*status = 'processing'/u);
    expect(connection.query.mock.calls[2][0]).toContain("'retry_wait'");
    expect(connection.query.mock.calls[2][0]).toContain('available_at <= NOW()');
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});
