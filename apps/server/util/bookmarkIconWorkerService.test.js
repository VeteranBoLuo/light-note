import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pool: {
    getConnection: vi.fn(),
    query: vi.fn(),
  },
  saveIconToDisk: vi.fn(),
  cleanupBookmarkIconFiles: vi.fn(),
  cleanupPreviousBookmarkIcon: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: mocks.pool }));
vi.mock('./bookmarkIconClient.js', () => ({
  fetchFaviconFromApi: vi.fn(),
  normalizeOrigin: vi.fn((value) => new URL(value).origin),
  isRetryableError: vi.fn(() => false),
}));
vi.mock('./bookmarkIconService.js', () => ({
  saveIconToDisk: mocks.saveIconToDisk,
  cleanupBookmarkIconFiles: mocks.cleanupBookmarkIconFiles,
  cleanupPreviousBookmarkIcon: mocks.cleanupPreviousBookmarkIcon,
}));

const { claimTasks, updateTaskResult } = await import('./bookmarkIconWorkerService.js');

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

describe('bookmark icon worker claiming', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('可领取到期 retry_wait，并恢复超时 processing', async () => {
    const connection = createConnection();
    connection.query
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
    expect(connection.query.mock.calls[0][0]).toContain("status = 'processing'");
    expect(connection.query.mock.calls[1][0]).toContain("'retry_wait'");
    expect(connection.query.mock.calls[1][0]).toContain('available_at <= NOW()');
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});
