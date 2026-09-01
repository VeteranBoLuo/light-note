import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pool: { getConnection: vi.fn(), query: vi.fn() },
  ensureNotVisitor: vi.fn(() => true),
  removeInboxRelations: vi.fn(),
  invalidatePersonalKnowledgeCache: vi.fn(() => Promise.resolve()),
  cleanupBookmarkIconFiles: vi.fn(() => Promise.resolve()),
  formatDateTime: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: mocks.pool }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  formatDateTime: mocks.formatDateTime,
}));
vi.mock('../util/fileCategory.js', () => ({ resolveFileCategory: vi.fn() }));
vi.mock('../util/resourceTags.js', () => ({
  normalizeTagIds: vi.fn(),
  validateUserTags: vi.fn(),
}));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: mocks.ensureNotVisitor }));
vi.mock('../util/resourceInbox.js', () => ({ removeInboxRelations: mocks.removeInboxRelations }));
vi.mock('../util/personalKnowledgeSearch.js', () => ({
  invalidatePersonalKnowledgeCache: mocks.invalidatePersonalKnowledgeCache,
}));
vi.mock('../util/bookmarkIconService.js', () => ({
  cleanupBookmarkIconFiles: mocks.cleanupBookmarkIconFiles,
}));

const { batchDeleteResources, globalSearch, previewBatchSelection } = await import('./searchHandle.js');

function createResponse() {
  return { send: vi.fn() };
}

function createConnection() {
  return {
    beginTransaction: vi.fn(),
    query: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
}

describe('batchDeleteResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureNotVisitor.mockReturnValue(true);
    mocks.removeInboxRelations.mockResolvedValue(0);
    mocks.invalidatePersonalKnowledgeCache.mockResolvedValue({ skipped: true });
    mocks.cleanupBookmarkIconFiles.mockResolvedValue({ deleted: 0 });
  });

  it('上百个书签合并为一笔集合更新和一次待整理清理', async () => {
    const ids = Array.from({ length: 120 }, (_, index) => `bookmark-${index + 1}`);
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([ids.map((id) => ({ id }))])
      .mockResolvedValueOnce([ids.map((id) => ({ id, iconUrl: `/uploads/${id}.png` }))])
      .mockResolvedValueOnce([{ affectedRows: ids.length }]);
    mocks.pool.getConnection.mockResolvedValue(connection);
    const res = createResponse();

    await batchDeleteResources(
      { user: { id: 'user-1' }, body: { items: ids.map((id) => ({ id, type: 'bookmark' })) } },
      res,
    );

    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.query).toHaveBeenCalledTimes(3);
    expect(connection.query.mock.calls[0][0]).toMatch(/SELECT id FROM `?bookmark`?/);
    expect(connection.query.mock.calls[1][0]).toContain('SELECT id, icon_url AS iconUrl');
    expect(connection.query.mock.calls[2][0]).toContain('UPDATE bookmark SET del_flag = 1');
    expect(mocks.removeInboxRelations).toHaveBeenCalledWith(connection, {
      userId: 'user-1',
      items: ids.map((id) => ({ resourceType: 'bookmark', resourceId: id })),
    });
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(mocks.cleanupBookmarkIconFiles).toHaveBeenCalledWith(
      ids.map((id) => ({ id, iconUrl: `/uploads/${id}.png` })),
      { db: mocks.pool },
    );
    expect(mocks.invalidatePersonalKnowledgeCache).toHaveBeenCalledOnce();
    expect(res.send).toHaveBeenCalledWith({
      data: {
        requestedItemCount: ids.length,
        validItemCount: ids.length,
        invalidItemCount: 0,
        affectedItemCount: ids.length,
        typeStats: [
          {
            type: 'bookmark',
            requestedCount: ids.length,
            validCount: ids.length,
            affectedItemCount: ids.length,
          },
        ],
      },
      status: 200,
      msg: '',
    });
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('拒绝超过单次上限的请求，避免占用数据库连接', async () => {
    const res = createResponse();
    const items = Array.from({ length: 1001 }, (_, index) => ({ id: `bookmark-${index}`, type: 'bookmark' }));

    await batchDeleteResources({ user: { id: 'user-1' }, body: { items } }, res);

    expect(mocks.pool.getConnection).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith({ data: null, status: 400, msg: '单次最多删除 1000 项资源' });
  });

  it('按当前筛选解析全部匹配资源后执行删除', async () => {
    const connection = createConnection();
    connection.query
      .mockResolvedValueOnce([[{ id: 'bookmark-1' }, { id: 'bookmark-2' }]])
      .mockResolvedValueOnce([[{ id: 'bookmark-1' }, { id: 'bookmark-2' }]])
      .mockResolvedValueOnce([
        [
          { id: 'bookmark-1', iconUrl: null },
          { id: 'bookmark-2', iconUrl: null },
        ],
      ])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);
    mocks.pool.getConnection.mockResolvedValue(connection);
    const res = createResponse();

    await batchDeleteResources(
      {
        user: { id: 'user-1' },
        body: {
          selection: {
            mode: 'allMatching',
            query: { keyword: '项目', types: ['bookmark'], date: '7d', tags: ['工作'] },
            excludedItems: [],
          },
        },
      },
      res,
    );

    expect(connection.query.mock.calls[0][0]).toContain('SELECT b.id AS id FROM bookmark b');
    expect(connection.query.mock.calls[0][0]).toContain('selected_tag.name IN (?)');
    expect(connection.query.mock.calls[0][0]).toContain('b.create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(res.send.mock.calls.at(-1)?.[0]).toMatchObject({
      status: 200,
      data: { requestedItemCount: 2, validItemCount: 2, affectedItemCount: 2 },
    });
  });
});

describe('previewBatchSelection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('返回全部匹配范围的分类型数量，并排除用户取消的条目', async () => {
    mocks.pool.query.mockImplementation(async (sql) => {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('SELECT b.id AS id FROM bookmark b')) {
        return [[{ id: 'bookmark-1' }, { id: 'bookmark-2' }]];
      }
      if (normalizedSql.includes('SELECT n.id AS id FROM note n')) return [[{ id: 'note-1' }]];
      return [[]];
    });
    const res = createResponse();

    await previewBatchSelection(
      {
        user: { id: 'user-1' },
        body: {
          selection: {
            mode: 'allMatching',
            query: { keyword: '项目', types: ['bookmark', 'note'] },
            excludedItems: [{ type: 'bookmark', id: 'bookmark-2' }],
          },
        },
      },
      res,
    );

    expect(res.send).toHaveBeenCalledWith({
      status: 200,
      msg: '',
      data: {
        mode: 'allMatching',
        total: 2,
        typeCounts: { bookmark: 1, note: 1, file: 0, tag: 0 },
        editableCount: 2,
        inboxCount: 2,
        deleteCount: 2,
      },
    });
  });
});

describe('globalSearch pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pool.query.mockImplementation(async (sql) => {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('SELECT name') && normalizedSql.includes('FROM tag')) {
        return [[{ name: '工作' }, { name: '稍后读' }]];
      }
      if (normalizedSql.includes('COUNT(*) AS total FROM bookmark')) return [[{ total: 30 }]];
      if (normalizedSql.includes('COUNT(*) AS total FROM note')) return [[{ total: 7 }]];
      if (normalizedSql.includes('COUNT(*) AS total FROM files')) return [[{ total: 5 }]];
      if (normalizedSql.includes('COUNT(*) AS total FROM tag')) return [[{ total: 2 }]];
      if (normalizedSql.includes('FROM bookmark b')) {
        return [
          [
            {
              id: 'bookmark-13',
              name: '项目资料',
              description: '项目描述',
              url: 'https://example.com',
              tag_list: [{ id: 'tag-1', name: '工作' }],
            },
          ],
        ];
      }
      return [[]];
    });
  });

  it('按类型和筛选条件统计总数，只返回请求页并暴露后续页状态', async () => {
    const res = createResponse();

    await globalSearch(
      {
        user: { id: 'user-1' },
        body: {
          keyword: '项目',
          page: 2,
          limitPerType: 12,
          type: 'bookmark',
          sort: 'name',
          date: '7d',
          tags: ['工作'],
        },
        headers: { 'x-lang': 'zh-CN' },
      },
      res,
    );

    const bookmarkListCall = mocks.pool.query.mock.calls.find(
      ([sql]) => String(sql).includes('FROM bookmark b') && String(sql).includes('LIMIT ? OFFSET ?'),
    );
    expect(bookmarkListCall).toBeTruthy();
    expect(bookmarkListCall[0]).toContain('b.create_time >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
    expect(bookmarkListCall[0]).toContain('selected_tag.name IN (?)');
    expect(bookmarkListCall[1].slice(-2)).toEqual([12, 12]);

    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload.status).toBe(200);
    expect(payload.data.items).toHaveLength(1);
    expect(payload.data.items[0]).toMatchObject({ id: 'bookmark-13', type: 'bookmark' });
    // 未显式请求待办时 todo 恒为 0，且不会产生 todo_items 查询
    expect(payload.data.typeTotals).toEqual({ bookmark: 30, note: 7, file: 5, tag: 2, todo: 0 });
    expect(mocks.pool.query.mock.calls.some(([sql]) => String(sql).includes('todo_items'))).toBe(false);
    expect(payload.data.total).toBe(44);
    expect(payload.data.page).toBe(2);
    expect(payload.data.pageSize).toBe(12);
    expect(payload.data.hasMoreByType).toEqual({
      bookmark: true,
      note: false,
      file: false,
      tag: false,
      todo: false,
    });
    expect(payload.data.hasMore).toBe(true);
    expect(payload.data.tagOptions).toEqual(['工作', '稍后读']);
  });

  it('全部结果按固定类型顺序合计返回 40 条，并在类型耗尽时用下一类型补齐', async () => {
    mocks.pool.query.mockImplementation(async (sql) => {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('SELECT name') && normalizedSql.includes('FROM tag')) {
        return [[{ name: '工作' }]];
      }
      if (normalizedSql.includes('COUNT(*) AS total FROM bookmark')) return [[{ total: 3 }]];
      if (normalizedSql.includes('COUNT(*) AS total FROM note')) return [[{ total: 50 }]];
      if (normalizedSql.includes('COUNT(*) AS total FROM files')) return [[{ total: 5 }]];
      if (normalizedSql.includes('COUNT(*) AS total FROM tag')) return [[{ total: 2 }]];
      if (normalizedSql.includes('FROM bookmark b')) {
        return [
          Array.from({ length: 3 }, (_, index) => ({
            id: `bookmark-${index + 1}`,
            name: `书签 ${index + 1}`,
            description: '',
            url: `https://example.com/${index + 1}`,
            tag_list: [],
          })),
        ];
      }
      if (normalizedSql.includes('FROM note n')) {
        return [
          Array.from({ length: 38 }, (_, index) => ({
            id: `note-${index + 1}`,
            title: `笔记 ${index + 1}`,
            content: '',
            tags: [],
          })),
        ];
      }
      return [[]];
    });
    const res = createResponse();

    await globalSearch(
      {
        user: { id: 'user-1' },
        body: {
          paginationMode: 'ordered',
          pageSize: 400,
          type: 'all',
          cursor: { type: 'bookmark', offset: 0 },
        },
        headers: { 'x-lang': 'zh-CN' },
      },
      res,
    );

    const listCalls = mocks.pool.query.mock.calls.filter(([sql]) => String(sql).includes('LIMIT ? OFFSET ?'));
    const bookmarkListCall = listCalls.find(([sql]) => String(sql).includes('FROM bookmark b'));
    const noteListCall = listCalls.find(([sql]) => String(sql).includes('FROM note n'));
    expect(bookmarkListCall?.[1].slice(-2)).toEqual([41, 0]);
    expect(noteListCall?.[1].slice(-2)).toEqual([38, 0]);
    expect(noteListCall?.[0]).toContain("IF(n.type = 'drawing', '', n.content) AS content");

    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload.status).toBe(200);
    expect(payload.data.pageSize).toBe(40);
    expect(payload.data.items).toHaveLength(40);
    expect(payload.data.items.slice(0, 3).every((item) => item.type === 'bookmark')).toBe(true);
    expect(payload.data.items.slice(3).every((item) => item.type === 'note')).toBe(true);
    expect(payload.data.groups.map((group) => [group.type, group.items.length])).toEqual([
      ['bookmark', 3],
      ['note', 37],
    ]);
    expect(payload.data.nextCursor).toEqual({ type: 'note', offset: 37 });
    expect(payload.data.hasMore).toBe(true);
    expect(payload.data.typeTotals).toEqual({ bookmark: 3, note: 50, file: 5, tag: 2, todo: 0 });
    expect(payload.data.hasMoreByType).toEqual({
      bookmark: false,
      note: true,
      file: true,
      tag: true,
      todo: false,
    });
  });

  it('有序分页追加批次不重复统计元数据，并能依次跨过剩余类型', async () => {
    mocks.pool.query.mockImplementation(async (sql) => {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('COUNT(*) AS total') || normalizedSql.includes('SELECT name')) {
        throw new Error('追加批次不应查询统计元数据');
      }
      if (normalizedSql.includes('FROM note n')) {
        return [
          Array.from({ length: 13 }, (_, index) => ({
            id: `note-${index + 38}`,
            title: `笔记 ${index + 38}`,
            content: '',
            tags: [],
          })),
        ];
      }
      if (normalizedSql.includes('FROM files')) {
        return [
          Array.from({ length: 5 }, (_, index) => ({
            id: String(index + 1),
            file_name: `文件 ${index + 1}.txt`,
            file_type: 'text/plain',
            tags: [],
          })),
        ];
      }
      if (normalizedSql.includes('FROM tag t')) {
        return [
          Array.from({ length: 2 }, (_, index) => ({
            id: `tag-${index + 1}`,
            name: `标签 ${index + 1}`,
            resource_count: 0,
          })),
        ];
      }
      return [[]];
    });
    const res = createResponse();

    await globalSearch(
      {
        user: { id: 'user-1' },
        body: {
          paginationMode: 'ordered',
          pageSize: 40,
          type: 'all',
          cursor: { type: 'note', offset: 37 },
          includeMetadata: false,
        },
        headers: { 'x-lang': 'zh-CN' },
      },
      res,
    );

    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload.status).toBe(200);
    expect(payload.data.items).toHaveLength(20);
    expect(payload.data.groups.map((group) => [group.type, group.items.length])).toEqual([
      ['note', 13],
      ['file', 5],
      ['tag', 2],
    ]);
    expect(payload.data.nextCursor).toBeNull();
    expect(payload.data.hasMore).toBe(false);
    expect(payload.data).not.toHaveProperty('typeTotals');
    expect(payload.data).not.toHaveProperty('tagOptions');
  });
});

describe('globalSearch 待办', () => {
  function todoRows(count, overrides = {}) {
    return Array.from({ length: count }, (_, index) => ({
      id: `todo-${index + 1}`,
      title: `待办 ${index + 1}`,
      description: '说明',
      status: 'pending',
      priority: 1,
      due_at: null,
      completed_at: null,
      update_time: '2026-07-31 10:00:00',
      reference_count: 0,
      ...overrides,
    }));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // queryTodos 用 formatDateTime 输出稳定时间串，默认 mock 返回 undefined 会掩盖字段错误
    mocks.formatDateTime.mockImplementation((date) => new Date(date).toISOString().slice(0, 19).replace('T', ' '));
    mocks.pool.query.mockImplementation(async (sql) => {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('SELECT name') && normalizedSql.includes('FROM tag')) return [[]];
      if (normalizedSql.includes('COUNT(*) AS total FROM todo_items')) return [[{ total: 9 }]];
      if (normalizedSql.includes('COUNT(*) AS total')) return [[{ total: 0 }]];
      if (normalizedSql.includes('FROM todo_items t')) return [todoRows(2)];
      return [[]];
    });
  });

  it('待办严格按 user_id 与 del_flag 过滤，并给出可定位的待办路由', async () => {
    const res = createResponse();

    await globalSearch(
      {
        user: { id: 'user-1' },
        body: { keyword: '备案', types: ['todo'], limitPerType: 12 },
        headers: { 'x-lang': 'zh-CN' },
      },
      res,
    );

    const todoListCall = mocks.pool.query.mock.calls.find(
      ([sql]) => String(sql).includes('FROM todo_items t') && String(sql).includes('LIMIT ? OFFSET ?'),
    );
    expect(todoListCall[0]).toContain('t.user_id = ?');
    expect(todoListCall[0]).toContain('t.del_flag = 0');
    expect(todoListCall[0]).toContain('(t.title LIKE ? OR t.description LIKE ?)');
    // 参考资料计数也必须按归属过滤，不能只按 todo_id
    expect(todoListCall[0]).toContain('r.todo_id = t.id AND r.user_id = ?');
    expect(todoListCall[1][0]).toBe('user-1');

    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload.status).toBe(200);
    expect(payload.data.items[0]).toMatchObject({
      id: 'todo-1',
      type: 'todo',
      status: 'pending',
      priority: 1,
      referenceCount: 0,
      route: '/inbox?tab=todo&todoId=todo-1',
    });
    expect(payload.data.typeTotals.todo).toBe(9);
  });

  it('按标签或无标签筛选时待办整体退出结果', async () => {
    const res = createResponse();

    await globalSearch(
      {
        user: { id: 'user-1' },
        body: { keyword: '备案', types: ['todo'], tags: ['工作'] },
        headers: { 'x-lang': 'zh-CN' },
      },
      res,
    );

    const todoCall = mocks.pool.query.mock.calls.find(([sql]) => String(sql).includes('FROM todo_items t'));
    expect(todoCall[0]).toContain('1 = 0');
    // 待办不进标签体系，不得混进 resource_tag_relations 条件
    expect(todoCall[0]).not.toContain('resource_tag_relations');
  });

  it('待办状态、优先级和截止条件进入 SQL', async () => {
    const res = createResponse();

    await globalSearch(
      {
        user: { id: 'user-1' },
        body: {
          keyword: '备案',
          types: ['todo'],
          todoStatus: 'pending',
          todoPriority: [2],
          todoDue: 'overdue',
        },
        headers: { 'x-lang': 'zh-CN' },
      },
      res,
    );

    const todoCall = mocks.pool.query.mock.calls.find(
      ([sql]) => String(sql).includes('FROM todo_items t') && String(sql).includes('LIMIT ? OFFSET ?'),
    );
    expect(todoCall[0]).toContain('t.status = ?');
    expect(todoCall[0]).toContain('t.priority IN (?)');
    expect(todoCall[0]).toContain("t.due_at < NOW() AND t.status = 'pending'");
    expect(todoCall[1]).toContain('pending');
    expect(todoCall[1]).toContain(2);
  });

  it('未完成只是同档位内的弱权重，不会压过标题完全匹配的已完成待办', async () => {
    mocks.pool.query.mockImplementation(async (sql) => {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('SELECT name') && normalizedSql.includes('FROM tag')) return [[]];
      if (normalizedSql.includes('COUNT(*) AS total')) return [[{ total: 0 }]];
      if (normalizedSql.includes('FROM todo_items t')) {
        return [
          [
            { ...todoRows(1)[0], id: 'todo-pending-loose', title: '顺手处理备案的相关杂事', status: 'pending' },
            { ...todoRows(1)[0], id: 'todo-done-exact', title: '备案', status: 'completed' },
          ],
        ];
      }
      return [[]];
    });
    const res = createResponse();

    await globalSearch(
      {
        user: { id: 'user-1' },
        body: { keyword: '备案', types: ['todo', 'note'], mode: 'suggest' },
        headers: { 'x-lang': 'zh-CN' },
      },
      res,
    );

    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload.data.items.map((entry) => entry.id)).toEqual(['todo-done-exact', 'todo-pending-loose']);
  });
});

describe('globalSearch 快捷模式', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.formatDateTime.mockImplementation(() => '2026-07-31 10:00:00');
  });

  it('最多返回 8 条、单类型最多 3 条，且不统计 typeTotals 与标签选项', async () => {
    mocks.pool.query.mockImplementation(async (sql) => {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('COUNT(*) AS total') || normalizedSql.includes('SELECT name')) {
        throw new Error('快捷模式不应统计元数据');
      }
      if (normalizedSql.includes('FROM bookmark b')) {
        return [
          Array.from({ length: 10 }, (_, index) => ({
            id: `bookmark-${index + 1}`,
            name: `备案书签 ${index + 1}`,
            description: '',
            url: '',
            tag_list: [],
          })),
        ];
      }
      if (normalizedSql.includes('FROM note n')) {
        return [
          Array.from({ length: 10 }, (_, index) => ({
            id: `note-${index + 1}`,
            title: `备案笔记 ${index + 1}`,
            content: '',
            tags: [],
          })),
        ];
      }
      return [[]];
    });
    const res = createResponse();

    await globalSearch(
      {
        user: { id: 'user-1' },
        body: { keyword: '备案', types: ['bookmark', 'note', 'file', 'tag', 'todo'], mode: 'suggest' },
        headers: { 'x-lang': 'zh-CN' },
      },
      res,
    );

    const payload = res.send.mock.calls.at(-1)?.[0];
    expect(payload.status).toBe(200);
    expect(payload.data.items).toHaveLength(8);
    // 先按单类型上限 3 完成均衡，只有其他类型没有匹配时才用超额类型补足剩余名额
    expect(payload.data.items.slice(0, 6).filter((entry) => entry.type === 'bookmark')).toHaveLength(3);
    expect(payload.data.items.slice(0, 6).filter((entry) => entry.type === 'note')).toHaveLength(3);
    expect(payload.data.items.slice(6).map((entry) => entry.id)).toEqual(['bookmark-4', 'bookmark-5']);
    expect(payload.data.hasMore).toBe(true);
    expect(payload.data).not.toHaveProperty('typeTotals');
    expect(payload.data).not.toHaveProperty('tagOptions');
  });

  it('来源页只做同档位弱加权，不缩小搜索范围也不翻转相关度档位', async () => {
    mocks.pool.query.mockImplementation(async (sql) => {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('COUNT(*) AS total') || normalizedSql.includes('SELECT name')) return [[]];
      if (normalizedSql.includes('FROM bookmark b')) {
        // 标题完全匹配，档位 100
        return [[{ id: 'bookmark-exact', name: '备案', description: '', url: '', tag_list: [] }]];
      }
      if (normalizedSql.includes('FROM note n')) {
        // 标题包含，档位 60
        return [[{ id: 'note-loose', title: '处理备案的笔记', content: '', tags: [] }]];
      }
      if (normalizedSql.includes('FROM todo_items t')) {
        // 同为标题包含档位 60；用已完成待办排除「未完成弱权重」的干扰，
        // 这样顺序差异只可能来自来源页加权
        return [
          [
            {
              id: 'todo-loose',
              title: '处理备案的事项',
              description: '',
              status: 'completed',
              priority: 1,
              due_at: null,
              completed_at: '2026-07-30 10:00:00',
              update_time: '2026-07-31 10:00:00',
              reference_count: 0,
            },
          ],
        ];
      }
      return [[]];
    });

    async function runWith(sourceType) {
      const res = createResponse();
      await globalSearch(
        {
          user: { id: 'user-1' },
          body: {
            keyword: '备案',
            types: ['bookmark', 'note', 'file', 'tag', 'todo'],
            mode: 'suggest',
            ...(sourceType ? { sourceType } : {}),
          },
          headers: { 'x-lang': 'zh-CN' },
        },
        res,
      );
      return res.send.mock.calls.at(-1)?.[0].data.items.map((entry) => entry.id);
    }

    // 无来源页：书签在前（note-loose 与 todo-loose 同档位，按类型顺序）
    expect(await runWith('')).toEqual(['bookmark-exact', 'note-loose', 'todo-loose']);
    // 待办页：待办在同档位内提到笔记之前，但仍排在标题完全匹配的书签之后，且其它类型都还在
    expect(await runWith('todo')).toEqual(['bookmark-exact', 'todo-loose', 'note-loose']);
  });

  it('未知 sourceType 按无来源处理', async () => {
    mocks.pool.query.mockImplementation(async (sql) => {
      const normalizedSql = String(sql);
      if (normalizedSql.includes('FROM bookmark b')) {
        return [[{ id: 'bookmark-1', name: '备案', description: '', url: '', tag_list: [] }]];
      }
      return [[]];
    });
    const res = createResponse();
    await globalSearch(
      {
        user: { id: 'user-1' },
        body: { keyword: '备案', types: ['bookmark'], mode: 'suggest', sourceType: '../etc/passwd' },
        headers: { 'x-lang': 'zh-CN' },
      },
      res,
    );
    expect(res.send.mock.calls.at(-1)?.[0].status).toBe(200);
  });
});
