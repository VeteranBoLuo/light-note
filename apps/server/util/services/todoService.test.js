import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTodo, deleteTodo, updateTodo } from './todoService.js';

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
});
