import { describe, expect, it, vi } from 'vitest';
import { recordOrganizeCompletions, recordTodoCompletion, recordTodoCreation } from './growthActivityHistory.js';

describe('growthActivityHistory', () => {
  it('待办贡献只落哈希引用和低敏感枚举', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await recordTodoCompletion(db, { userId: 'user-1', todoId: 'todo-sensitive-id' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('completed_at');
    expect(sql).toContain('SHA2(CONCAT(?');
    expect(sql).toContain("JSON_OBJECT('kind', ?, 'meaningful', true)");
    expect(params).toEqual(['user-1', 'todo_complete', 'todo:', 'todo', 'todo-sensitive-id', 'user-1']);
  });

  it('创建待办使用独立事件类型，不与完成事实混用', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await recordTodoCreation(db, { userId: 'user-1', todoId: 'todo-1' });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('create_time');
    expect(sql).not.toContain('completed_at IS NOT NULL');
    expect(params).toEqual(['user-1', 'todo_create', 'todo_create:', 'todo_create', 'todo-1', 'user-1']);
  });

  it('整理贡献排除种子资源并批量固化完成时间', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 2 }]) };
    await recordOrganizeCompletions(db, {
      userId: 'user-1',
      resourceType: 'note',
      resourceIds: ['n1', 'n2', 'n1'],
    });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("'organize_complete'");
    expect(sql).toContain('onboarding_seed_resources');
    expect(sql).toContain('ri.complete_time');
    expect(params).toEqual(['user-1', 'note', 'n1', 'n2']);
  });
});
