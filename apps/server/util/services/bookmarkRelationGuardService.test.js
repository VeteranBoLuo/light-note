import { describe, expect, it, vi } from 'vitest';
import { queryBookmarkRelationGuards } from './bookmarkRelationGuardService.js';

describe('bookmarkRelationGuardService', () => {
  it('把快照、笔记、普通待办和系列待办引用汇总为删除阻断', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ bookmarkId: 'bookmark-1', total: 1 }]])
        .mockResolvedValueOnce([[{ bookmarkId: 'bookmark-1', total: 2 }]])
        .mockResolvedValueOnce([[{ bookmarkId: 'bookmark-2', total: 3 }]])
        .mockResolvedValueOnce([[{ bookmarkId: 'bookmark-1', total: 4 }]]),
    };

    const guards = await queryBookmarkRelationGuards(db, {
      userId: 'user-1',
      bookmarkIds: ['bookmark-1', 'bookmark-2', 'bookmark-1'],
    });

    expect(db.query).toHaveBeenCalledTimes(4);
    expect(guards.get('bookmark-1')).toMatchObject({
      snapshot: 1,
      noteReference: 2,
      todoReference: 0,
      todoSeriesReference: 4,
      blockerCount: 7,
    });
    expect(guards.get('bookmark-1')?.blockers.map((item) => item.code)).toEqual([
      'snapshot',
      'noteReference',
      'todoSeriesReference',
    ]);
    expect(guards.get('bookmark-2')).toMatchObject({ todoReference: 3, blockerCount: 3 });
  });

  it('任一登记关系表查询失败时直接失败关闭', async () => {
    const db = {
      query: vi.fn().mockResolvedValueOnce([[]]).mockRejectedValueOnce(new Error('relation table unavailable')),
    };

    await expect(
      queryBookmarkRelationGuards(db, { userId: 'user-1', bookmarkIds: ['bookmark-1'] }),
    ).rejects.toThrow('relation table unavailable');
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('合并事务使用锁定读取，阻止检查后并发新增引用穿过删除门禁', async () => {
    const db = { query: vi.fn().mockResolvedValue([[]]) };

    await queryBookmarkRelationGuards(db, {
      userId: 'user-1',
      bookmarkIds: ['bookmark-1'],
      lock: true,
    });

    expect(db.query).toHaveBeenCalledTimes(4);
    db.query.mock.calls.forEach(([sql]) => expect(String(sql).trim()).toMatch(/FOR UPDATE$/));
  });
});
