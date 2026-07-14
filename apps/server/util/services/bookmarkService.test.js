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

vi.mock('../../db/index.js', () => ({ default: pool }));
vi.mock('./tagService.js', () => ({ ensureTag }));
vi.mock('../resourceTags.js', () => ({
  RESOURCE_TYPE: { BOOKMARK: 'bookmark' },
  insertResourceTagRelations,
  validateUserTags,
}));
vi.mock('../resourceInbox.js', () => ({ enqueueResources: vi.fn() }));
vi.mock('../snapshot.js', () => ({ archiveBookmark: vi.fn() }));
vi.mock('../fetchWebMeta.js', () => ({ fetchWebMeta: vi.fn() }));
vi.mock('./resourceCreateEffects.js', () => ({ triggerResourceCreateEffects: vi.fn() }));

const { createBookmark } = await import('./bookmarkService.js');

describe('bookmarkService.createBookmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
