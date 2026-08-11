import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enforceToolPolicy, normalizeRegisteredTool } from '../toolPolicy.js';

const getConnection = vi.fn();
const prepareTodoDeletion = vi.fn();
const applyTodoDeletion = vi.fn();

vi.mock('../../../db/index.js', () => ({ default: { getConnection } }));
vi.mock('../../services/todoService.js', () => ({ prepareTodoDeletion, applyTodoDeletion }));

const { default: tool, normalizeDeleteTodoArgs } = await import('./delete_todo.js');

describe('delete_todo 工具', () => {
  let connection;

  beforeEach(() => {
    vi.clearAllMocks();
    connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    getConnection.mockResolvedValue(connection);
  });

  it('公开 schema 只接受单条目标与封闭删除范围', () => {
    expect(
      normalizeDeleteTodoArgs({ task_id: ' [todo:todo-1] ', todo_title: '发票', delete_scope: ' FUTURE ' }),
    ).toEqual({
      todoId: 'todo-1',
      keyword: '发票',
      scope: 'future',
    });
    expect(
      normalizeDeleteTodoArgs({
        todoId: 'todo-2',
        expectedVersion: 'server-version',
        targetTitle: '不应进入公开参数',
      }),
    ).toEqual({ todoId: 'todo-2', keyword: '' });
    expect(tool).toMatchObject({
      isWrite: true,
      directAction: true,
      riskLevel: 'medium',
      confirmationPolicy: 'always',
      dependencyBindings: [{ argument: 'todoId', refType: 'todo', requireUnique: true }],
    });
  });

  it('prepare 通过共享 Service 冻结当前账号的目标与范围', async () => {
    prepareTodoDeletion.mockResolvedValue({
      todoId: 'todo-1',
      scope: 'current',
      expectedVersion: 'version-1',
      targetTitle: '整理发票',
      currentStatus: 'pending',
      activeReminderCount: 1,
    });

    await expect(tool.prepareArgs({ query: '整理发票' }, { userId: 'user-1', request: {} })).resolves.toMatchObject({
      todoId: 'todo-1',
      expectedVersion: 'version-1',
    });
    expect(prepareTodoDeletion).toHaveBeenCalledWith(
      expect.any(Object),
      'user-1',
      expect.objectContaining({ keyword: '整理发票' }),
    );
  });

  it('冻结字段不允许模型伪造，但允许确认阶段复用服务端参数', async () => {
    prepareTodoDeletion.mockResolvedValue({
      todoId: 'todo-1',
      scope: 'current',
      expectedVersion: 'version-1',
      targetTitle: '整理发票',
    });
    const registered = normalizeRegisteredTool(tool);
    const registry = new Map([[registered.name, registered]]);
    const context = {
      userId: 'user-1',
      userRole: 'user',
      billingUserId: 'user-1',
      billingUserRole: 'user',
      request: {},
    };
    await expect(
      enforceToolPolicy({
        registry,
        toolName: 'delete_todo',
        args: { todoId: 'todo-1', expectedVersion: 'forged' },
        context,
        phase: 'plan',
      }),
    ).rejects.toMatchObject({ code: 'TOOL_ARGUMENTS_ADDITIONAL_PROPERTY' });
    const prepared = await enforceToolPolicy({
      registry,
      toolName: 'delete_todo',
      args: { todoId: 'todo-1' },
      context,
      phase: 'plan',
    });
    expect(prepared.args).toMatchObject({ todoId: 'todo-1', expectedVersion: 'version-1' });
    await expect(
      enforceToolPolicy({
        registry,
        toolName: 'delete_todo',
        args: prepared.args,
        context,
        phase: 'execute',
        confirmed: true,
        trustedPreparedArgs: true,
        prepare: false,
      }),
    ).resolves.toMatchObject({ args: expect.objectContaining({ expectedVersion: 'version-1' }) });
  });

  it('确认卡明确展示任务系列范围、已完成历史和提醒影响', () => {
    const preview = tool.preview({
      todoId: 'todo-1',
      targetTitle: '每周周报',
      currentStatus: 'pending',
      scope: 'future',
      dueAt: '2026-08-12 18:00:00',
      priority: 2,
      activeReminderCount: 2,
      recurring: true,
      planVersion: 2,
    });

    expect(preview).toMatchObject({ title: '删除待办', target: '每周周报' });
    expect(preview.impact).toContain('当前及以后');
    expect(preview.impact).toContain('已完成历史保留');
    expect(preview.details).toEqual(expect.arrayContaining([{ key: 'deleteScope', value: '当前及以后' }]));
    expect(preview.details).not.toEqual(expect.arrayContaining([{ key: 'activeReminderCount', value: '2 条' }]));
  });

  it('管理员代管上下文在获取连接前失败关闭', async () => {
    await expect(
      tool.prepareArgs({ todoId: 'todo-1' }, { userId: 'user-1', request: { adminContext: {} } }),
    ).rejects.toMatchObject({ code: 'TODO_ADMIN_CONTEXT_FORBIDDEN', status: 403 });
    await expect(
      tool.execute(
        { todoId: 'todo-1', scope: 'current', expectedVersion: 'version-1' },
        { userId: 'user-1', request: { adminContext: {} } },
      ),
    ).rejects.toMatchObject({ code: 'TODO_ADMIN_CONTEXT_FORBIDDEN', status: 403 });
    expect(getConnection).not.toHaveBeenCalled();
  });

  it('确认执行复用同一事务连接，并只使用 Service 成功结果生成回执', async () => {
    applyTodoDeletion.mockResolvedValue({
      state: 'deleted',
      title: '整理发票',
      scope: 'current',
      affectedItems: 1,
    });

    const result = await tool.execute(
      { todoId: 'todo-1', scope: 'current', expectedVersion: 'version-1' },
      { userId: 'user-1', request: {} },
    );

    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(applyTodoDeletion).toHaveBeenCalledWith(
      connection,
      'user-1',
      expect.objectContaining({ todoId: 'todo-1', scope: 'current', expectedVersion: 'version-1' }),
    );
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
    expect(tool.transform(result)).toBe('✅ 待办“整理发票”已移入回收站。');
  });

  it('Service 失败时回滚，提交回包不明时标记结果未知', async () => {
    applyTodoDeletion.mockRejectedValueOnce(Object.assign(new Error('冲突'), { code: 'TODO_DELETE_CONFLICT' }));
    await expect(
      tool.execute(
        { todoId: 'todo-1', scope: 'current', expectedVersion: 'version-1' },
        { userId: 'user-1', request: {} },
      ),
    ).rejects.toMatchObject({ code: 'TODO_DELETE_CONFLICT' });
    expect(connection.rollback).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    getConnection.mockResolvedValue(connection);
    applyTodoDeletion.mockResolvedValueOnce({ state: 'deleted', title: '整发票', scope: 'current' });
    connection.commit.mockRejectedValueOnce(new Error('commit response lost'));
    await expect(
      tool.execute(
        { todoId: 'todo-1', scope: 'current', expectedVersion: 'version-1' },
        { userId: 'user-1', request: {} },
      ),
    ).rejects.toMatchObject({ commitOutcomeUnknown: true });
  });
});
