import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enforceToolPolicy, normalizeRegisteredTool } from '../toolPolicy.js';

const getConnection = vi.fn();
const prepareTodoStatusChange = vi.fn();
const applyTodoStatusChange = vi.fn();

vi.mock('../../../db/index.js', () => ({ default: { getConnection } }));
vi.mock('../../services/todoService.js', () => ({ prepareTodoStatusChange, applyTodoStatusChange }));

const { default: tool, normalizeSetTodoStatusArgs } = await import('./set_todo_status.js');

describe('set_todo_status 工具', () => {
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

  it('公开 schema 只接受单条待办目标，服务端冻结参数不会混入模型参数', () => {
    expect(
      normalizeSetTodoStatusArgs({ task_id: ' todo-1 ', todo_title: '发票', status: ' COMPLETED ' }),
    ).toMatchObject({
      todoId: 'todo-1',
      keyword: '发票',
      status: 'completed',
    });
    expect(
      normalizeSetTodoStatusArgs({
        todoId: 'todo-1',
        status: 'pending',
        expectedVersion: 'server-version',
        targetTitle: '整理发票',
      }),
    ).toEqual({ todoId: 'todo-1', keyword: '', status: 'pending' });
    expect(tool).toMatchObject({
      isWrite: true,
      directAction: true,
      riskLevel: 'low',
      confirmationPolicy: 'always',
    });
  });

  it('prepare 只调用共享 Service 冻结当前账号的目标', async () => {
    prepareTodoStatusChange.mockResolvedValue({
      todoId: 'todo-1',
      status: 'completed',
      expectedVersion: 'version-1',
      targetTitle: '整理发票',
      currentStatus: 'pending',
      activeReminderCount: 1,
    });

    await expect(
      tool.prepareArgs({ query: '整理发票', status: 'completed' }, { userId: 'user-1', request: {} }),
    ).resolves.toMatchObject({ todoId: 'todo-1', expectedVersion: 'version-1' });
    expect(prepareTodoStatusChange).toHaveBeenCalledWith(
      expect.any(Object),
      'user-1',
      expect.objectContaining({ keyword: '整理发票', status: 'completed' }),
    );
  });

  it('模型参数先通过封闭 schema，冻结字段只在服务端确认参数中保留', async () => {
    prepareTodoStatusChange.mockResolvedValue({
      todoId: 'todo-1',
      status: 'completed',
      expectedVersion: 'version-1',
      targetTitle: '整理发票',
      currentStatus: 'pending',
      activeReminderCount: 0,
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
        toolName: 'set_todo_status',
        args: { todoId: 'todo-1', status: 'completed', expectedVersion: 'forged' },
        context,
        phase: 'plan',
      }),
    ).rejects.toMatchObject({ code: 'TOOL_ARGUMENTS_ADDITIONAL_PROPERTY' });
    const prepared = await enforceToolPolicy({
      registry,
      toolName: 'set_todo_status',
      args: { todoId: 'todo-1', status: 'completed' },
      context,
      phase: 'plan',
    });
    expect(prepared.args).toMatchObject({ todoId: 'todo-1', expectedVersion: 'version-1' });
    await expect(
      enforceToolPolicy({
        registry,
        toolName: 'set_todo_status',
        args: prepared.args,
        context,
        phase: 'execute',
        confirmed: true,
        trustedPreparedArgs: true,
        prepare: false,
      }),
    ).resolves.toMatchObject({ args: expect.objectContaining({ expectedVersion: 'version-1' }) });
  });

  it('管理员代管上下文不能准备或执行用户待办写入', async () => {
    await expect(
      tool.prepareArgs({ todoId: 'todo-1', status: 'completed' }, { userId: 'user-1', request: { adminContext: {} } }),
    ).rejects.toMatchObject({ code: 'TODO_ADMIN_CONTEXT_FORBIDDEN', status: 403 });
    await expect(
      tool.execute(
        { todoId: 'todo-1', status: 'completed', expectedVersion: 'version-1' },
        { userId: 'user-1', request: { adminContext: {} } },
      ),
    ).rejects.toMatchObject({ code: 'TODO_ADMIN_CONTEXT_FORBIDDEN', status: 403 });
    expect(getConnection).not.toHaveBeenCalled();
    expect(prepareTodoStatusChange).not.toHaveBeenCalled();
    expect(applyTodoStatusChange).not.toHaveBeenCalled();
  });

  it('确认卡展示冻结目标、目标状态和提醒副作用', () => {
    const preview = tool.preview({
      todoId: 'todo-1',
      targetTitle: '整理发票',
      currentStatus: 'pending',
      status: 'completed',
      dueAt: '2026-07-24 10:00:00',
      priority: 2,
      activeReminderCount: 2,
    });
    expect(preview).toMatchObject({ title: '完成待办', target: '整理发票' });
    expect(preview.impact).toContain('取消 2 条尚未触发的提醒');
    expect(preview.details).toEqual(
      expect.arrayContaining([
        { key: 'currentStatus', value: '待处理' },
        { key: 'targetStatus', value: '已完成' },
        { key: 'activeReminderCount', value: '2 条' },
      ]),
    );
  });

  it('确认执行复用同一事务连接，提交后才释放连接', async () => {
    applyTodoStatusChange.mockResolvedValue({
      state: 'changed',
      title: '整理发票',
      status: 'completed',
      cancelledReminderCount: 1,
    });

    const result = await tool.execute(
      { todoId: 'todo-1', status: 'completed', expectedVersion: 'version-1' },
      { userId: 'user-1', request: {} },
    );

    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(applyTodoStatusChange).toHaveBeenCalledWith(
      connection,
      'user-1',
      expect.objectContaining({ todoId: 'todo-1', status: 'completed', expectedVersion: 'version-1' }),
    );
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
    expect(tool.transform(result)).toContain('已设为已完成');
  });

  it('共享 Service 失败时回滚，且不把失败变成成功回执', async () => {
    applyTodoStatusChange.mockRejectedValue(Object.assign(new Error('冲突'), { code: 'TODO_STATUS_CONFLICT' }));

    await expect(
      tool.execute(
        { todoId: 'todo-1', status: 'completed', expectedVersion: 'version-1' },
        { userId: 'user-1', request: {} },
      ),
    ).rejects.toMatchObject({ code: 'TODO_STATUS_CONFLICT' });
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('提交回包不明时标记结果未知，交给一次性确认流程安全重试而不伪造失败', async () => {
    const commitError = new Error('commit response lost');
    connection.commit.mockRejectedValueOnce(commitError);
    applyTodoStatusChange.mockResolvedValue({ state: 'changed', title: '整理发票', status: 'completed' });

    await expect(
      tool.execute(
        { todoId: 'todo-1', status: 'completed', expectedVersion: 'version-1' },
        { userId: 'user-1', request: {} },
      ),
    ).rejects.toMatchObject({ commitOutcomeUnknown: true });
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});
