import { describe, expect, it, vi } from 'vitest';
import { resolveExplicitResourceSelection } from './resourceSelectionService.js';

function database(records) {
  return {
    query: vi.fn(async (sql, args) => {
      if (sql.includes('resource_tag_relations')) return [[{ resourceId: 'same', id: 'tag', name: '标签' }]];
      const type =
        sql.includes('`note`') || sql.includes('FROM note ')
          ? 'note'
          : sql.includes('`files`') || sql.includes('FROM files ')
            ? 'file'
            : 'bookmark';
      expect(sql).toMatch(/del_flag = 0/);
      expect(sql).toMatch(/(?:user_id|create_by)`? = \?/);
      const available = records.filter(
        (x) => x.type === type && x.owner === args[0] && !x.deleted && args.slice(1).includes(x.id),
      );
      return [available.map(({ owner, deleted, ...row }) => row)];
    }),
  };
}
describe('显式选择权威核对', () => {
  it('按主体、存活状态隔离，跨类型同 ID 不串项，保留请求顺序', async () => {
    const db = database([
      { type: 'note', id: 'same', owner: 'target', title: '笔记' },
      { type: 'bookmark', id: 'same', owner: 'target', title: '书签', url: 'https://example.com' },
      { type: 'note', id: 'gone', owner: 'target', deleted: true },
      { type: 'file', id: 'other', owner: 'someone' },
    ]);
    const result = await resolveExplicitResourceSelection(db, 'target', [
      { type: 'note', id: 'same' },
      { type: 'bookmark', id: 'same' },
      { type: 'note', id: 'gone' },
      { type: 'file', id: 'other' },
    ]);
    expect(result.resolvedItems.map((x) => `${x.type}:${x.id}`)).toEqual(['note:same', 'bookmark:same']);
    expect(result.resolvedItems[1].tagList).toEqual([{ id: 'tag', name: '标签' }]);
    expect(result.unavailableItems.map((x) => x.id)).toEqual(['gone', 'other']);
    expect(db.query.mock.calls.every(([sql]) => !/content|file_key|file_url/i.test(sql))).toBe(true);
  });
  it('全部失效及空集合正常返回，不以当前列表推断', async () => {
    const db = database([]);
    expect(await resolveExplicitResourceSelection(db, 'target', [{ type: 'file', id: 1 }])).toEqual({
      resolvedItems: [],
      unavailableItems: [{ type: 'file', id: '1' }],
    });
    expect(await resolveExplicitResourceSelection(db, 'target', [])).toEqual({
      resolvedItems: [],
      unavailableItems: [],
    });
  });
  it('1000 项按 200 分块，1001 项整体拒绝且不查询', async () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ type: 'note', id: String(i) }));
    const db = database(items.map((x) => ({ ...x, owner: 'target', title: x.id })));
    expect((await resolveExplicitResourceSelection(db, 'target', items)).resolvedItems).toHaveLength(1000);
    expect(db.query).toHaveBeenCalledTimes(10);
    db.query.mockClear();
    await expect(
      resolveExplicitResourceSelection(db, 'target', [...items, { type: 'note', id: '1000' }]),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.query).not.toHaveBeenCalled();
  });
  it.each([null, [{ type: 'tag', id: 'x' }], [{ type: '__proto__', id: 'x' }], [{ type: 'note', id: '' }]])(
    '拒绝非法输入 %#',
    async (input) => {
      await expect(resolveExplicitResourceSelection(database([]), 'target', input)).rejects.toMatchObject({
        status: 400,
      });
    },
  );
});
