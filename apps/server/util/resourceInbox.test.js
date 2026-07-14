import { describe, expect, it, vi } from 'vitest';
import {
  assertResourcesOwned,
  completeResources,
  enqueueResources,
  normalizeInboxItems,
  normalizeInboxSource,
  normalizeResourceType,
  queryPendingCount,
} from './resourceInbox.js';

describe('resourceInbox', () => {
  it('严格校验资源类型、来源、数量并去重', () => {
    expect(normalizeResourceType('NOTE')).toBe('note');
    expect(normalizeResourceType('task')).toBeNull();
    expect(normalizeInboxSource('duplicate_requeue')).toBe('duplicate_requeue');
    expect(normalizeInboxSource('unsafe')).toBeNull();
    expect(normalizeInboxItems([])).toBeNull();
    expect(normalizeInboxItems(Array.from({ length: 51 }, (_, i) => ({ resourceType: 'note', resourceId: i })))).toBeNull();
    expect(
      normalizeInboxItems([
        { resourceType: 'note', resourceId: 'n1' },
        { resourceType: 'note', resourceId: 'n1' },
      ]),
    ).toEqual([{ resourceType: 'note', resourceId: 'n1' }]);
  });

  it('归属检查按固定表映射查询并拒绝缺失资源', async () => {
    const connection = {
      query: vi.fn().mockResolvedValueOnce([[{ id: 'n1' }]]).mockResolvedValueOnce([[{ id: '8' }]]),
    };
    const items = [
      { resourceType: 'note', resourceId: 'n1' },
      { resourceType: 'file', resourceId: '8' },
    ];
    await expect(assertResourcesOwned(connection, { userId: 'u1', items })).resolves.toBeUndefined();
    expect(connection.query.mock.calls[0][0]).toContain('FROM note');
    expect(connection.query.mock.calls[1][0]).toContain('FROM files');

    const denied = { query: vi.fn().mockResolvedValue([[]]) };
    await expect(
      assertResourcesOwned(denied, {
        userId: 'u1',
        items: [{ resourceType: 'bookmark', resourceId: 'other-user-resource' }],
      }),
    ).rejects.toMatchObject({ code: 'INBOX_RESOURCE_FORBIDDEN' });
  });

  it('加入操作区分新增、重新打开和幂等忽略', async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }]])
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ status: 'completed' }]])
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ status: 'pending' }]]),
    };
    const result = await enqueueResources(connection, {
      userId: 'u1',
      source: 'manual',
      items: [
        { resourceType: 'bookmark', resourceId: 'b1' },
        { resourceType: 'bookmark', resourceId: 'b2' },
        { resourceType: 'bookmark', resourceId: 'b3' },
      ],
    });
    expect(result).toEqual({ added: 1, reopened: 1, ignored: 1 });
  });

  it('完成只更新当前用户 pending 关系且不触碰资源表', async () => {
    const connection = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ id: 'n1' }, { id: 'n2' }]])
        .mockResolvedValueOnce([{ affectedRows: 2 }]),
    };
    const result = await completeResources(connection, {
      userId: 'u1',
      items: [
        { resourceType: 'note', resourceId: 'n1' },
        { resourceType: 'note', resourceId: 'n2' },
      ],
    });
    expect(result).toEqual({ completed: 2 });
    expect(connection.query.mock.calls[1][0]).toContain("status = 'pending'");
    expect(connection.query.mock.calls[1][0]).not.toContain('UPDATE note');
  });

  it('数量结果始终包含三种资源', async () => {
    const connection = {
      query: vi.fn().mockResolvedValue([[{ resourceType: 'note', total: 2 }, { resourceType: 'file', total: 1 }]]),
    };
    await expect(queryPendingCount(connection, 'u1')).resolves.toEqual({
      pendingTotal: 3,
      typeTotals: { bookmark: 0, note: 2, file: 1 },
    });
  });
});
