import { beforeEach, describe, expect, it, vi } from 'vitest';

const removeInboxRelations = vi.hoisted(() => vi.fn());
vi.mock('../resourceInbox.js', () => ({ removeInboxRelations }));

const { softDeleteOwnedCloudFiles } = await import('./cloudFileDeletionService.js');

describe('cloudFileDeletionService', () => {
  beforeEach(() => {
    removeInboxRelations.mockReset();
    removeInboxRelations.mockResolvedValue(0);
  });

  it('复用软删除语义：移入回收站、移除待整理关系并撤销分享', async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 2 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
    };

    await expect(
      softDeleteOwnedCloudFiles(connection, { userId: 'user-1', fileIds: [3, '3', 7, 0, 'invalid'] }),
    ).resolves.toEqual({ fileIds: [3, 7], deletedFileCount: 2 });

    expect(connection.query.mock.calls[0]).toEqual([
      expect.stringContaining('SET del_flag = 1, deleted_at = NOW()'),
      [3, 7, 'user-1'],
    ]);
    expect(removeInboxRelations).toHaveBeenCalledWith(connection, {
      userId: 'user-1',
      items: [
        { resourceType: 'file', resourceId: '3' },
        { resourceType: 'file', resourceId: '7' },
      ],
    });
    expect(connection.query.mock.calls[1]).toEqual([expect.stringContaining("status = 'revoked'"), [3, 7, 'user-1']]);
  });

  it('大批量删除会分批执行，避免生成超长 IN 参数', async () => {
    const connection = { query: vi.fn().mockResolvedValue([{ affectedRows: 200 }]) };
    const fileIds = Array.from({ length: 201 }, (_, index) => index + 1);

    await softDeleteOwnedCloudFiles(connection, { userId: 'user-1', fileIds });

    expect(removeInboxRelations).toHaveBeenCalledTimes(2);
    expect(connection.query).toHaveBeenCalledTimes(4);
    expect(connection.query.mock.calls[0][1]).toHaveLength(201);
    expect(connection.query.mock.calls[2][1]).toEqual([201, 'user-1']);
  });
});
