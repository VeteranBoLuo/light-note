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

    expect(connection.query).toHaveBeenCalledTimes(3);
    expect(connection.query.mock.calls[0][0]).toContain('INSERT INTO todo_items');
    expect(connection.query.mock.calls[2][0]).toContain('ON DUPLICATE KEY UPDATE');
  });

  it('拒绝晚于截止时间的提醒', async () => {
    await expect(createTodo(connection, 'user-1', {
      title: '处理账单',
      dueAt: '2026-07-20T17:00',
      reminderAt: '2026-07-20T18:00',
    })).rejects.toThrow('提醒时间不能晚于截止时间');
    expect(connection.query).not.toHaveBeenCalled();
  });

  it('更新不属于当前用户的待办时返回 null', async () => {
    connection.query.mockResolvedValueOnce([[]]);
    await expect(updateTodo(connection, 'user-2', 'todo-1', { title: '越权更新' })).resolves.toBeNull();
    expect(connection.query).toHaveBeenCalledWith(
      expect.stringContaining('user_id = ?'),
      ['todo-1', 'user-2'],
    );
  });

  it('软删除始终带 user_id 条件', async () => {
    connection.query
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    await expect(deleteTodo(connection, 'user-3', 'todo-2')).resolves.toBe(1);
    expect(connection.query.mock.calls[0][1]).toEqual(['todo-2', 'user-3']);
    expect(connection.query.mock.calls[1][1]).toEqual(['todo-2', 'user-3']);
  });
});
