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

vi.mock('../../../db/index.js', () => ({ default: pool }));
vi.mock('../../fetchWebMeta.js', () => ({ fetchWebMeta: vi.fn() }));
vi.mock('../tagUtil.js', () => ({ ensureTag }));

const { default: createBookmark } = await import('./create_bookmark.js');

describe('Agent create_bookmark 事务', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connection.beginTransaction.mockResolvedValue();
    connection.commit.mockResolvedValue();
    connection.rollback.mockResolvedValue();
    connection.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValue([{ affectedRows: 1 }]);
    ensureTag.mockResolvedValue('tag-1');
  });

  it('书签和标签关系在同一连接内提交', async () => {
    const result = await createBookmark.execute(
      { url: 'https://example.com', name: 'Example', description: 'desc', tags: ['资料'] },
      { userId: 'user-1' },
    );

    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(ensureTag).toHaveBeenCalledWith('user-1', '资料', connection);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ name: 'Example', tags: ['资料'] });
  });

  it('标签阶段失败时回滚整个收藏操作', async () => {
    ensureTag.mockRejectedValueOnce(new Error('tag insert failed'));

    await expect(
      createBookmark.execute(
        { url: 'https://example.com', name: 'Example', description: 'desc', tags: ['资料'] },
        { userId: 'user-1' },
      ),
    ).rejects.toThrow('tag insert failed');

    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
