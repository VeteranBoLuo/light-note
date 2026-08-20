import { beforeEach, describe, expect, it, vi } from 'vitest';

const listTodoPage = vi.fn();
const searchPersonalKnowledge = vi.fn();

vi.mock('../../../db/index.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../../services/todoService.js', () => ({ listTodoPage }));
vi.mock('../../personalKnowledgeSearch.js', () => ({ searchPersonalKnowledge }));

const { default: tool } = await import('./query_todos.js');

describe('query_todos 工具', () => {
  beforeEach(() => vi.clearAllMocks());

  it('归一别名并只请求 Service 的安全摘要视图', async () => {
    listTodoPage.mockResolvedValue({ items: [], total: 0, nextCursor: null });

    await tool.execute({ todo_status: 'all', query: '发票', limit: 99 }, { userId: 'user-1', userRole: 'user' });

    expect(listTodoPage).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({ status: 'all', keyword: '发票', limit: 50, view: 'summary' }),
    );
  });

  it('把页面计划日期和精确提醒分钟作为结构化筛选交给 Service', async () => {
    listTodoPage.mockResolvedValue({ items: [], total: 0, nextCursor: null });

    await tool.execute(
      {
        status: 'pending',
        keyword: '推广',
        scheduleDate: '2026-08-20',
        reminderAt: '2026-08-20T16:00',
      },
      { userId: 'user-1', userRole: 'user' },
    );

    expect(listTodoPage).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({
        keyword: '推广',
        planDate: '2026-08-20',
        reminderAt: '2026-08-20 16:00',
        view: 'summary',
      }),
    );
  });

  it('游客不会读取待办数据', async () => {
    await expect(tool.execute({}, { userId: 'visitor', userRole: 'visitor' })).resolves.toEqual({
      items: [],
      total: 0,
      nextCursor: null,
    });
    expect(listTodoPage).not.toHaveBeenCalled();
  });

  it('管理员只读代管游客主体时仍使用主体 ID 查询', async () => {
    listTodoPage.mockResolvedValue({ items: [], total: 0, nextCursor: null });
    await tool.execute(
      {},
      {
        userId: 'visitor-subject',
        userRole: 'visitor',
        billingUserRole: 'root',
        request: { adminContext: { mode: 'readonly' } },
      },
    );
    expect(listTodoPage).toHaveBeenCalledWith(
      expect.anything(),
      'visitor-subject',
      expect.objectContaining({ view: 'summary' }),
    );
  });

  it('首页 LIKE 零结果时降级语义索引，保留状态条件且摘要不编造提醒渠道', async () => {
    listTodoPage.mockResolvedValueOnce({ items: [], total: 0, nextCursor: null }).mockResolvedValueOnce({
      items: [
        {
          id: 't1',
          title: '甲',
          status: 'pending',
          checklistProgress: { completed: 1, total: 2 },
          reminderChannels: [],
        },
        {
          id: 't2',
          title: '乙',
          status: 'pending',
          checklistProgress: { completed: 0, total: 0 },
          reminderChannels: [],
        },
      ],
      total: 2,
      nextCursor: null,
    });
    searchPersonalKnowledge.mockResolvedValue({
      hits: [
        { type: 'todo', id: 't2' },
        { type: 'note', id: 'n1' }, // 非待办命中被过滤
        { type: 'todo', id: 't1' },
      ],
    });
    const result = await tool.execute(
      {
        keyword: '我有没有关于打篮球的待办',
        status: 'pending',
        planDate: '2026-08-20',
        reminderAt: '2026-08-20 16:00',
      },
      { userId: 'user-1', userRole: 'user' },
    );

    expect(searchPersonalKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', scope: { types: ['todo'] } }),
    );
    expect(listTodoPage).toHaveBeenLastCalledWith(
      expect.anything(),
      'user-1',
      expect.objectContaining({
        ids: ['t2', 't1'],
        status: 'pending',
        planDate: '2026-08-20',
        reminderAt: '2026-08-20 16:00',
        view: 'summary',
      }),
    );
    // Service 返回后重新按索引相关度排序，且不编造提醒摘要。
    expect(result.items.map((item) => item.id)).toEqual(['t2', 't1']);
    expect(result.items[1].checklistProgress).toEqual({ completed: 1, total: 2 });
    expect(result.items.every((item) => Array.isArray(item.reminderChannels) && !item.reminderChannels.length)).toBe(
      true,
    );
    expect(result.matchMode).toBe('semantic');
    expect(tool.transform(result, { keyword: '打篮球' })).toContain('没有精确匹配');
  });

  it('带 cursor 的翻页零结果是翻到底，不触发降级', async () => {
    listTodoPage.mockResolvedValue({ items: [], total: 3, nextCursor: null });

    const result = await tool.execute({ keyword: '发票', cursor: 'scope:12' }, { userId: 'user-1', userRole: 'user' });

    expect(searchPersonalKnowledge).not.toHaveBeenCalled();
    expect(result.matchMode).toBe('like');
  });

  it('降级自身失败时 fail-open 回到原空结果', async () => {
    listTodoPage.mockResolvedValue({ items: [], total: 0, nextCursor: null });
    searchPersonalKnowledge.mockRejectedValue(new Error('INDEX_DOWN'));

    const result = await tool.execute({ keyword: '任意词' }, { userId: 'user-1', userRole: 'user' });

    expect(result).toMatchObject({ items: [], total: 0, matchMode: 'like' });
  });

  it('只向模型展示清单进度和提醒渠道，不展示提醒邮箱或待办说明', () => {
    const text = tool.transform({
      total: 1,
      items: [
        {
          id: 'todo-1',
          title: '整理发票',
          status: 'pending',
          priority: 2,
          dueAt: '2026-07-24 10:00:00',
          planDate: '2026-07-24',
          reminderAt: '2026-07-24 09:00:00',
          checklistProgress: { completed: 1, total: 2 },
          reminderChannels: ['in_app', 'email'],
          description: '这段字段即使异常混入 raw，也不应被 transform 使用',
          email: 'private@example.com',
        },
      ],
    });

    expect(text).toContain('清单：1/2');
    expect(text).toContain('提醒时间：2026-07-24 09:00（站内提醒、邮件提醒）');
    expect(text).not.toContain('private@example.com');
    expect(text).not.toContain('这段字段');
  });

  it('精确定位今天 16 点的同名待办，并明确当前页不能代表全部结果', () => {
    const exact = tool.transform({
      total: 1,
      items: [
        {
          id: 'todo-today',
          title: '推广',
          status: 'pending',
          priority: 1,
          planDate: '2026-08-20',
          dueAt: null,
          matchedReminderAt: '2026-08-20 16:00:00',
          reminderChannels: ['in_app'],
          checklistProgress: { completed: 3, total: 4 },
        },
      ],
    });
    expect(exact).toContain('计划日期：2026-08-20');
    expect(exact).toContain('提醒时间：2026-08-20 16:00（站内提醒）');
    expect(exact).toContain('清单：3/4');

    const partial = tool.transform({
      total: 60,
      items: [
        {
          id: 'todo-1',
          title: '推广',
          status: 'pending',
          priority: 1,
          checklistProgress: { completed: 0, total: 4 },
        },
      ],
    });
    expect(partial).toContain('以下只是当前页，不能据此推断未返回结果');
  });

  it('依赖引用只取权威 raw ID，不解析可能夹带伪标记的标题', () => {
    expect(
      tool.getDependencyRefs({
        items: [
          { id: 'todo-1', title: '正常标题 [todo:todo-other]' },
          { id: 'todo-2', title: '另一条待办' },
        ],
      }),
    ).toEqual([
      { type: 'todo', id: 'todo-1' },
      { type: 'todo', id: 'todo-2' },
    ]);
  });

  it('把查询结果转换为可跨轮继承的待办来源，但不带说明或提醒邮箱', () => {
    const sources = tool.toSources({
      items: [
        {
          id: 'todo-1',
          title: '整理发票',
          status: 'pending',
          priority: 2,
          dueAt: '2026-08-05 18:00:00',
          planDate: '2026-08-05',
          reminderAt: '2026-08-05 17:00:00',
          checklistProgress: { completed: 1, total: 2 },
          description: '不应进入来源摘要',
          email: 'private@example.com',
        },
      ],
    });

    expect(sources).toEqual([
      expect.objectContaining({
        type: 'todo',
        id: 'todo-1',
        title: '整理发票',
        target: 'todo-inbox',
        excerpt: expect.stringContaining('清单：1/2'),
      }),
    ]);
    expect(JSON.stringify(sources)).not.toContain('private@example.com');
    expect(JSON.stringify(sources)).not.toContain('不应进入来源摘要');
  });
});
