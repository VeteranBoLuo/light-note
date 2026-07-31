import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  copyTodoResourceRefs,
  loadTodoResourceRefMap,
  MAX_TODO_RESOURCE_REFS,
  normalizeTodoResourceRefs,
  replaceTodoResourceRefs,
} from './todoReferenceService.js';

describe('todoReferenceService', () => {
  let connection;

  beforeEach(() => {
    connection = { query: vi.fn() };
  });

  it('未传引用时返回 null,表示「本次不改动关系」', () => {
    expect(normalizeTodoResourceRefs(undefined)).toBeNull();
    expect(normalizeTodoResourceRefs(null)).toBeNull();
    expect(normalizeTodoResourceRefs([])).toEqual([]);
  });

  it('去重后保持首次出现的顺序', () => {
    const refs = normalizeTodoResourceRefs([
      { type: 'note', id: 'n1' },
      { type: 'bookmark', id: 'b1' },
      { type: 'note', id: 'n1' },
    ]);
    expect(refs).toEqual([
      { type: 'note', id: 'n1' },
      { type: 'bookmark', id: 'b1' },
    ]);
  });

  it('拒绝非法类型、空 ID 与超量引用', () => {
    expect(() => normalizeTodoResourceRefs([{ type: 'tag', id: 't1' }])).toThrow('参考资料类型不支持');
    expect(() => normalizeTodoResourceRefs([{ type: 'note', id: '' }])).toThrow('参考资料标识不合法');
    const tooMany = Array.from({ length: MAX_TODO_RESOURCE_REFS + 1 }, (_, index) => ({
      type: 'note',
      id: `n${index}`,
    }));
    expect(() => normalizeTodoResourceRefs(tooMany)).toThrow('最多关联');
  });

  it('替换前先清空,空列表只删不插', async () => {
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    await replaceTodoResourceRefs(connection, { userId: 'u1', todoId: 't1', refs: [] });
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query.mock.calls[0][0]).toContain('DELETE FROM todo_resource_refs');
    expect(connection.query.mock.calls[0][1]).toEqual(['t1', 'u1']);
  });

  it('任一引用不属于当前用户时整体拒绝', async () => {
    connection.query
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[{ id: 'n1', name: '我的笔记' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    await expect(
      replaceTodoResourceRefs(connection, {
        userId: 'u1',
        todoId: 't1',
        refs: [
          { type: 'note', id: 'n1' },
          { type: 'note', id: 'other-user-note' },
        ],
      }),
    ).rejects.toThrow('无权访问');
    // 不应执行 INSERT
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO todo_resource_refs'))).toBe(
      false,
    );
  });

  it('写入时保留顺序并落标题快照', async () => {
    // 只传 note 类型时,归属校验只会对 note 表发一次查询
    connection.query
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockResolvedValueOnce([[{ id: 'n1', name: '备案清单' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await replaceTodoResourceRefs(connection, {
      userId: 'u1',
      todoId: 't1',
      refs: [{ type: 'note', id: 'n1' }],
    });

    expect(result).toEqual({ count: 1 });
    const insertCall = connection.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO todo_resource_refs'),
    );
    expect(insertCall[1][0]).toEqual([['t1', 'u1', 'note', 'n1', '备案清单', 0]]);
  });

  it('批量读取用一次查询,失效目标回落到快照标题并标记不可用', async () => {
    connection.query
      .mockResolvedValueOnce([
        [
          { todoId: 't1', type: 'note', id: 'n1', snapshotTitle: '旧标题', sortOrder: 0 },
          { todoId: 't2', type: 'bookmark', id: 'b1', snapshotTitle: '已删书签', sortOrder: 0 },
        ],
      ])
      // resolveOwnedResourceRefSummaries 内部的三次归属查询
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 'n1', name: '现在的标题' }]])
      .mockResolvedValueOnce([[]]);

    const map = await loadTodoResourceRefMap(connection, { userId: 'u1', todoIds: ['t1', 't2'] });

    const listSql = connection.query.mock.calls[0][0];
    expect(listSql).toContain('WHERE user_id = ? AND todo_id IN (?,?)');
    expect(map.get('t1')[0]).toMatchObject({ title: '现在的标题', available: true });
    expect(map.get('t2')[0]).toMatchObject({ title: '已删书签', available: false });
  });

  it('无待办 ID 时不查询', async () => {
    await expect(loadTodoResourceRefMap(connection, { userId: 'u1', todoIds: [] })).resolves.toEqual(new Map());
    expect(connection.query).not.toHaveBeenCalled();
  });

  it('复制引用时限定来源归属', async () => {
    connection.query.mockResolvedValueOnce([{ affectedRows: 2 }]);
    const result = await copyTodoResourceRefs(connection, { userId: 'u1', fromTodoId: 't1', toTodoId: 't2' });
    expect(result).toEqual({ count: 2 });
    expect(connection.query.mock.calls[0][1]).toEqual(['t2', 't1', 'u1']);
  });

  it('源与目标相同时不复制', async () => {
    await expect(
      copyTodoResourceRefs(connection, { userId: 'u1', fromTodoId: 't1', toTodoId: 't1' }),
    ).resolves.toEqual({ count: 0 });
    expect(connection.query).not.toHaveBeenCalled();
  });
});
