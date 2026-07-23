import { beforeEach, describe, expect, it, vi } from 'vitest';

const listTodoPage = vi.fn();

vi.mock('../../../db/index.js', () => ({ default: {} }));
vi.mock('../../services/todoService.js', () => ({ listTodoPage }));

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
          checklistProgress: { completed: 1, total: 2 },
          reminderChannels: ['in_app', 'email'],
          description: '这段字段即使异常混入 raw，也不应被 transform 使用',
          email: 'private@example.com',
        },
      ],
    });

    expect(text).toContain('清单：1/2');
    expect(text).toContain('站内提醒、邮件提醒');
    expect(text).not.toContain('private@example.com');
    expect(text).not.toContain('这段字段');
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
});
