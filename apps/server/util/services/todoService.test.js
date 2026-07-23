import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTodoStatusChange,
  createTodo,
  deleteTodo,
  listTodoPage,
  listTodos,
  prepareTodoStatusChange,
  updateTodo,
} from './todoService.js';

describe('todoService', () => {
  let connection;

  beforeEach(() => {
    connection = { query: vi.fn() };
  });

  it('拒绝空标题，且不执行数据库写入', async () => {
    await expect(createTodo(connection, 'user-1', { title: '   ' })).rejects.toThrow('待办标题不能为空');
    expect(connection.query).not.toHaveBeenCalled();
  });

  it('创建带提醒的待办时写入待办和提醒计划', async () => {
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    await createTodo(connection, 'user-1', {
      title: '处理账单',
      dueAt: '2026-07-20T18:00',
      reminderAt: '2026-07-20T17:00',
    });

    expect(connection.query).toHaveBeenCalledTimes(4);
    expect(connection.query.mock.calls[0][0]).toContain('INSERT INTO todo_items');
    expect(connection.query.mock.calls[3][0]).toContain('INSERT INTO todo_reminders');
  });

  it('创建周期提醒时分别写入站内和邮箱渠道', async () => {
    connection.query.mockResolvedValue([{ affectedRows: 1 }]);
    await createTodo(connection, 'user-1', {
      title: '周期复盘',
      dueAt: '2026-07-30T18:00',
      reminder: {
        mode: 'repeat',
        channels: ['in_app', 'email'],
        startAt: '2026-07-20T09:00',
        endAt: '2026-07-30T09:00',
        intervalMinutes: 1440,
        email: 'owner@example.com',
      },
    });

    const reminderInserts = connection.query.mock.calls.filter(([sql]) => sql === 'INSERT INTO todo_reminders SET ?');
    expect(reminderInserts).toHaveLength(2);
    expect(reminderInserts.map(([, [row]]) => row.channel)).toEqual(['in_app', 'email']);
  });

  it('更新提醒时优先复用相同计划时间的历史记录，避免唯一索引冲突', async () => {
    connection.query
      .mockResolvedValueOnce([
        [
          {
            id: 'todo-1',
            title: '回访客户',
            description: null,
            checklist: '[]',
            priority: 1,
            due_at: '2026-07-21T10:00',
          },
        ],
      ])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ id: 'historical-reminder' }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);

    await updateTodo(connection, 'user-1', 'todo-1', {
      reminder: {
        mode: 'once',
        channels: ['in_app'],
        startAt: '2026-07-20T09:00',
      },
    });

    expect(connection.query.mock.calls[4]).toEqual([
      expect.stringContaining('ORDER BY (scheduled_at = ?) DESC'),
      ['todo-1', 'user-1', 'in_app', '2026-07-20 09:00:00'],
    ]);
    expect(connection.query.mock.calls[5][1].at(-1)).toBe('historical-reminder');
  });

  it('邮箱渠道必须提供有效邮箱', async () => {
    await expect(
      createTodo(connection, 'user-1', {
        title: '测试邮件提醒',
        reminder: {
          mode: 'once',
          channels: ['email'],
          startAt: '2026-07-20T09:00',
          email: 'invalid',
        },
      }),
    ).rejects.toThrow('提醒邮箱格式无效');
    expect(connection.query).not.toHaveBeenCalled();
  });

  it('周期提醒结束时间必须晚于开始时间', async () => {
    await expect(
      createTodo(connection, 'user-1', {
        title: '错误周期',
        reminder: {
          mode: 'repeat',
          channels: ['in_app'],
          startAt: '2026-07-20T09:00',
          endAt: '2026-07-20T08:00',
          intervalMinutes: 60,
        },
      }),
    ).rejects.toThrow('提醒结束时间必须晚于开始时间');
  });

  it('限制单个周期计划的提醒次数，避免邮件滥发', async () => {
    await expect(
      createTodo(connection, 'user-1', {
        title: '过于频繁的计划',
        reminder: {
          mode: 'repeat',
          channels: ['email'],
          startAt: '2026-07-20T09:00',
          endAt: '2026-07-21T09:00',
          intervalMinutes: 5,
          email: 'owner@example.com',
        },
      }),
    ).rejects.toThrow('单个周期提醒最多执行 100 次');
  });

  it('拒绝晚于截止时间的提醒', async () => {
    await expect(
      createTodo(connection, 'user-1', {
        title: '处理账单',
        dueAt: '2026-07-20T17:00',
        reminderAt: '2026-07-20T18:00',
      }),
    ).rejects.toThrow('提醒时间不能晚于截止时间');
    expect(connection.query).not.toHaveBeenCalled();
  });

  it('更新不属于当前用户的待办时返回 null', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    await expect(updateTodo(connection, 'user-2', 'todo-1', { title: '越权更新' })).resolves.toBeNull();
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('user_id = ?'), ['todo-1', 'user-2']);
  });

  it('软删除始终带 user_id 条件', async () => {
    connection.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await expect(deleteTodo(connection, 'user-3', 'todo-2')).resolves.toBe(1);
    expect(connection.query.mock.calls[0][1]).toEqual(['todo-2', 'user-3']);
    expect(connection.query.mock.calls[1][1]).toEqual(['todo-2', 'user-3']);
  });

  it('筛选全部时不追加完成状态条件', async () => {
    connection.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);

    await expect(listTodos(connection, 'user-4', { status: 'all' })).resolves.toEqual([]);

    expect(connection.query.mock.calls[0]).toEqual([expect.not.stringContaining('status = ?'), ['user-4']]);
  });

  it('Agent 摘要分页不读取说明或提醒邮箱，并返回清单进度和下一页游标', async () => {
    connection.query
      .mockResolvedValueOnce([
        [
          {
            id: 'todo-1',
            title: '整理发票',
            checklist: JSON.stringify([
              { id: 'a', text: '归档', done: true },
              { id: 'b', text: '核对', done: false },
            ]),
            priority: 2,
            status: 'pending',
            dueAt: '2026-07-24 10:00:00',
            completedAt: null,
          },
          {
            id: 'todo-2',
            title: '下一条',
            checklist: '[]',
            priority: 1,
            status: 'pending',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ total: 2 }]])
      .mockResolvedValueOnce([
        [
          { todoId: 'todo-1', channel: 'in_app' },
          { todoId: 'todo-1', channel: 'email' },
        ],
      ]);

    const result = await listTodoPage(connection, 'user-5', { status: 'pending', limit: 1, view: 'summary' });

    expect(connection.query.mock.calls[0][0]).toContain('LIMIT ? OFFSET ?');
    expect(connection.query.mock.calls[0][0]).not.toContain('description');
    expect(connection.query.mock.calls[0][1]).toEqual(['user-5', 'pending', 2, 0]);
    expect(connection.query.mock.calls[2][0]).not.toContain('target_email');
    expect(result).toEqual({
      items: [
        {
          id: 'todo-1',
          title: '整理发票',
          priority: 2,
          status: 'pending',
          dueAt: '2026-07-24 10:00:00',
          completedAt: null,
          checklistProgress: { completed: 1, total: 2 },
          reminderChannels: ['in_app', 'email'],
        },
      ],
      total: 2,
      nextCursor: expect.any(String),
    });
  });

  it('为 Agent 状态修改按关键词冻结单个待办和权威版本，不向模型暴露待办说明', async () => {
    connection.query
      .mockResolvedValueOnce([
        [
          {
            id: 'todo-1',
            title: '整理发票',
            description: '仅服务端快照使用',
            checklist: '[]',
            priority: 2,
            status: 'pending',
            dueAt: '2026-07-24 10:00:00',
            completedAt: null,
            updatedAt: '2026-07-23 10:00:00',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ activeReminderCount: 2 }]]);

    const result = await prepareTodoStatusChange(connection, 'user-6', {
      keyword: '发票',
      status: 'completed',
    });

    expect(connection.query.mock.calls[0]).toEqual([expect.stringContaining('title LIKE ?'), ['user-6', '%发票%']]);
    expect(connection.query.mock.calls[0][0]).not.toContain('SELECT *');
    expect(result).toMatchObject({
      todoId: 'todo-1',
      status: 'completed',
      targetTitle: '整理发票',
      currentStatus: 'pending',
      activeReminderCount: 2,
    });
    expect(result.expectedVersion).toEqual(expect.any(String));
    expect(result).not.toHaveProperty('description');
    expect(result).not.toHaveProperty('checklist');
  });

  it('多个同名待办不会默认选择，而是返回服务端白名单候选', async () => {
    connection.query.mockResolvedValueOnce([
      [
        { id: 'todo-1', title: '周报', checklist: '[]', priority: 1, status: 'pending', updatedAt: '2026-07-23' },
        { id: 'todo-2', title: '周报', checklist: '[]', priority: 2, status: 'pending', updatedAt: '2026-07-22' },
      ],
    ]);

    await expect(
      prepareTodoStatusChange(connection, 'user-7', { keyword: '周报', status: 'completed' }),
    ).rejects.toMatchObject({
      code: 'TODO_SELECTION_REQUIRED',
      status: 409,
      data: {
        candidates: [
          { todoId: 'todo-1', title: '周报', status: 'pending' },
          { todoId: 'todo-2', title: '周报', status: 'pending' },
        ],
      },
    });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  it('按标题关键词冻结目标时把 LIKE 通配符按字面文本处理', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    await expect(
      prepareTodoStatusChange(connection, 'user-7', { keyword: '100%', status: 'completed' }),
    ).rejects.toMatchObject({ code: 'TODO_NOT_FOUND' });
    expect(connection.query.mock.calls[0][1]).toEqual(['user-7', '%100\\%%']);
  });

  it('准备阶段会拒绝不存在和已处于目标状态的待办', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    await expect(
      prepareTodoStatusChange(connection, 'user-8', { todoId: 'missing', status: 'completed' }),
    ).rejects.toMatchObject({ code: 'TODO_NOT_FOUND', status: 404 });

    connection.query.mockResolvedValueOnce([
      [
        {
          id: 'todo-3',
          title: '已完成事项',
          checklist: '[]',
          priority: 1,
          status: 'completed',
          updatedAt: '2026-07-23',
        },
      ],
    ]);
    await expect(
      prepareTodoStatusChange(connection, 'user-8', { todoId: 'todo-3', status: 'completed' }),
    ).rejects.toMatchObject({ code: 'TODO_STATUS_NOOP', status: 409 });
  });

  it('确认执行在事务内锁定待办、复核版本、取消未触发提醒并失效个人检索缓存', async () => {
    const row = {
      id: 'todo-4',
      title: '完成合同',
      description: null,
      checklist: '[]',
      priority: 1,
      status: 'pending',
      dueAt: '2026-07-24 18:00:00',
      completedAt: null,
      updatedAt: '2026-07-23 11:00:00',
    };
    connection.query.mockResolvedValueOnce([[row]]).mockResolvedValueOnce([[{ activeReminderCount: 1 }]]);
    const prepared = await prepareTodoStatusChange(connection, 'user-9', { todoId: 'todo-4', status: 'completed' });
    connection.query.mockReset();
    connection.query
      .mockResolvedValueOnce([[row]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);

    const result = await applyTodoStatusChange(connection, 'user-9', prepared);

    expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(connection.query.mock.calls[0][1]).toEqual(['todo-4', 'user-9']);
    expect(connection.query.mock.calls[1][0]).toContain('UPDATE todo_items');
    expect(connection.query.mock.calls[2][0]).toContain("status = 'cancelled'");
    expect(result).toMatchObject({
      state: 'changed',
      todoId: 'todo-4',
      title: '完成合同',
      previousStatus: 'pending',
      status: 'completed',
      cancelledReminderCount: 2,
    });
  });

  it('确认前目标被修改时拒绝写入；若已被改为目标状态则安全返回 noop', async () => {
    const row = {
      id: 'todo-5',
      title: '更新状态',
      description: null,
      checklist: '[]',
      priority: 1,
      status: 'pending',
      dueAt: null,
      completedAt: null,
      updatedAt: '2026-07-23 11:00:00',
    };
    connection.query.mockResolvedValueOnce([[row]]);
    await expect(
      applyTodoStatusChange(connection, 'user-10', {
        todoId: 'todo-5',
        status: 'completed',
        expectedVersion: 'outdated-version',
      }),
    ).rejects.toMatchObject({ code: 'TODO_STATUS_CONFLICT', status: 409 });
    expect(connection.query).toHaveBeenCalledTimes(1);

    connection.query.mockReset();
    connection.query.mockResolvedValueOnce([[{ ...row, status: 'completed', completedAt: '2026-07-23 12:00:00' }]]);
    await expect(
      applyTodoStatusChange(connection, 'user-10', {
        todoId: 'todo-5',
        status: 'completed',
        expectedVersion: 'any-snapshot',
      }),
    ).resolves.toMatchObject({ state: 'noop', status: 'completed' });
    expect(connection.query).toHaveBeenCalledTimes(1);
  });
});
