import { describe, it, expect, vi } from 'vitest';
vi.mock('../personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache: vi.fn() }));
import {
  normalizeTodoOrganization,
  writeTodoOrganization,
  updateTodoOrganization,
  deleteTodoList,
  copyTodoOrganization,
  hydrateTodoOrganization,
  todoOrganizationFilters,
  todoWorkspaceCounts,
  listTodoLists,
} from './todoOrganizationService.js';

const dbReturning = (...responses) => ({
  query: responses.reduce(
    (fn, rows) => fn.mockResolvedValueOnce([rows]),
    vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
  ),
});

describe('todo organization', () => {
  it('旧载荷省略组织字段零写入，显式 null/空数组解除关联', async () => {
    const db = dbReturning();
    expect(normalizeTodoOrganization({})).toEqual({});
    expect(normalizeTodoOrganization({ tagIds: null, listId: null })).toEqual({ tagIds: [], listId: null });
    await writeTodoOrganization(db, 'owner', ['todo'], { title: 'only title' });
    expect(db.query).not.toHaveBeenCalled();
    await writeTodoOrganization(db, 'owner', ['todo'], { listId: null, tagIds: [] });
    expect(db.query.mock.calls).toEqual([
      [expect.stringContaining('UPDATE todo_items SET list_id'), [null, ['todo'], 'owner']],
      [expect.stringContaining('DELETE FROM todo_tag_relations'), ['todo', ['todo'], 'owner']],
    ]);
  });
  it('拒绝非法、越权和失效标签，不得先删除原关系', async () => {
    expect(() => normalizeTodoOrganization({ tagIds: 'other' })).toThrow();
    expect(() => normalizeTodoOrganization({ listId: {} })).toThrow();
    const db = dbReturning([]);
    await expect(writeTodoOrganization(db, 'owner', ['todo'], { tagIds: ['foreign'] })).rejects.toMatchObject({
      code: 'TODO_TAG_FORBIDDEN',
    });
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1]).toEqual([['foreign'], 'owner']);
  });
  it('去重标签并同时验证清单归属', async () => {
    const db = dbReturning([{ id: 'list' }], [{ id: 'tag' }]);
    await writeTodoOrganization(db, 'owner', ['todo'], { listId: 'list', tagIds: ['tag', 'tag'] });
    expect(db.query.mock.calls.at(-1)[1]).toEqual([[['owner', 'todo', 'todo', 'tag']]]);
  });
  it.each(['future', 'series'])('%s 修改只写未完成实例与模板，不调用调度表', async (scope) => {
    const db = dbReturning(
      [{ id: 'todo', seriesId: 'series', occurrenceNo: 3 }],
      [{ id: 'series' }],
      [{ id: 'pending-3' }, { id: 'pending-4' }],
    );
    expect(await updateTodoOrganization(db, 'owner', { id: 'todo', tagIds: [], listId: null, scope })).toEqual({
      affected: 2,
    });
    const queries = db.query.mock.calls;
    expect(queries[2][0]).toContain("status = 'pending'");
    expect(queries[2][0].includes('occurrence_no >= ?')).toBe(scope === 'future');
    expect(queries.some(([sql]) => /reminder|del_flag\s*=\s*1|INSERT INTO todo_items/.test(sql))).toBe(false);
    expect(queries.filter(([sql]) => sql.startsWith('UPDATE')).map(([, params]) => params[1])).toEqual([
      ['series'],
      ['pending-3', 'pending-4'],
    ]);
  });
  it('混入外部待办的批量操作整体拒绝', async () => {
    const db = dbReturning([{ id: 'own' }]);
    await expect(updateTodoOrganization(db, 'owner', { ids: ['own', 'foreign'], tagIds: [] })).rejects.toMatchObject({
      code: 'TODO_NOT_FOUND',
    });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('清单删除保留实例、完成历史和提醒，仅解除两个归属后删除清单', async () => {
    const db = dbReturning([{ id: 'list' }]);
    await deleteTodoList(db, 'owner', 'list');
    expect(db.query.mock.calls.slice(1)).toEqual([
      ['UPDATE todo_items SET list_id = NULL WHERE list_id = ? AND user_id = ?', ['list', 'owner']],
      ['UPDATE todo_series SET list_id = NULL WHERE list_id = ? AND user_id = ?', ['list', 'owner']],
      ['DELETE FROM todo_lists WHERE id = ? AND user_id = ?', ['list', 'owner']],
    ]);
  });
  it.each(['todo', 'series'])('从 %s 继承时跳过已删除标签与清单', async (targetType) => {
    const db = dbReturning();
    await copyTodoOrganization(db, 'owner', 'source', 'next', targetType);
    expect(db.query.mock.calls[0][0]).toContain(
      targetType === 'todo' ? 'JOIN todo_items source' : 'JOIN todo_series source',
    );
    expect(db.query.mock.calls[2][0]).toContain('t.del_flag = 0');
    expect(db.query.mock.calls[2][1]).toEqual(['next', targetType, 'source', 'owner']);
  });
  it('批量回显当前名称而非名称快照，空关联保留稳定读模型', async () => {
    const db = dbReturning(
      [{ id: 'a', listId: 'l', listName: '改名清单', listColor: '#6554ed' }],
      [{ todoId: 'a', id: 't', name: '改名标签' }],
    );
    const items = await hydrateTodoOrganization(db, 'owner', [{ id: 'a' }, { id: 'b' }]);
    expect(items[0]).toMatchObject({ list: { name: '改名清单' }, tags: [{ name: '改名标签' }] });
    expect(items[1]).toEqual({ id: 'b', listId: null, list: null, tags: [] });
    expect(db.query).toHaveBeenCalledTimes(2);
  });
  it('工作区多标签取交集，日期窗口只影响查询范围', () => {
    const filter = todoOrganizationFilters({
      tagIds: ['a', 'b'],
      listId: null,
      rangeStart: '2026-09-01',
      rangeEnd: '2026-09-30',
    });
    expect(filter.where.filter((sql) => sql.startsWith('EXISTS'))).toHaveLength(2);
    expect(filter.params).toEqual(['a', 'b', '2026-09-01', '2026-09-30']);
    expect(() => todoOrganizationFilters({ rangeStart: '2026-01-01', rangeEnd: '2026-12-31' })).toThrow();
  });
  it('全局未完成统计不带关键词，状态计数不带所选状态或分页', async () => {
    const db = dbReturning(
      [{ status: 'pending', allTotal: '100', overdue: null }, { status: 'completed', allTotal: '40', overdue: '2' }],
      [
        { status: 'pending', total: '26' },
        { status: 'completed', total: '7' },
      ],
    );
    const counts = await todoWorkspaceCounts(db, 'owner', {
      keyword: '报告',
      status: 'completed',
      limit: 5,
      listId: 'list',
    });
    expect(counts).toEqual({
      overview: { allTotal: 100, overdue: 0 },
      navigationCounts: { pending: { allTotal: 100, overdue: 0 }, completed: { allTotal: 40, overdue: 2 } },
      statusTotals: { pending: 26, completed: 7, all: 33 },
      groupCounts: { all: 7 },
    });
    expect(db.query.mock.calls[0][1]).toEqual(['owner']);
    expect(db.query.mock.calls[1][1]).toEqual(['owner', 'list', '%报告%', '%报告%']);
  });
});

it('清单同时提供两种状态数量，空清单为零', async () => {
  const db = dbReturning([{ id: 'empty', pendingTotal: null, completedTotal: null }, { id: 'done-only', pendingTotal: '0', completedTotal: '3' }]);
  expect(await listTodoLists(db, 'owner')).toEqual([{ id: 'empty', pendingTotal: 0, completedTotal: 0 }, { id: 'done-only', pendingTotal: 0, completedTotal: 3 }]);
});

it('全部已完成时未完成概览仍返回零而非未知', async () => {
  const counts = await todoWorkspaceCounts(dbReturning([{ status: 'completed', allTotal: '4' }], []), 'owner');
  expect(counts.overview).toMatchObject({ allTotal: 0, overdue: 0, today: 0, week: 0, scheduled: 0 });
  expect(counts.navigationCounts.completed.allTotal).toBe(4);
});

it.each([
  ['add', ['kept', 'chosen']],
  ['remove', ['kept']],
])('批量标签 %s 保留其他标签且不移动清单', async (tagMode, expected) => {
  const existing = tagMode === 'add' ? ['kept'] : ['kept', 'chosen'];
  const db = dbReturning(
    [{ id: 'todo', status: 'pending' }],
    [{ listId: 'list' }],
    existing.map((id) => ({ id })),
    expected.map((id) => ({ id })),
  );
  await updateTodoOrganization(db, 'owner', { ids: ['todo'], tagIds: ['chosen'], tagMode });
  const insert = db.query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO todo_tag_relations'));
  expect(insert[1][0]).toEqual(expected.map((id) => ['owner', 'todo', 'todo', id]));
  expect(db.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE todo_items SET list_id'))).toBe(false);
});
