import { expect, it, vi } from 'vitest';
import { updateTodo } from './todoService.js';
import { updateTodoPlan } from './todoSeriesService.js';
import { updateTodoOrganization } from './todoOrganizationService.js';

it.each([
  ['普通更新', (db) => updateTodo(db, 'owner', 'todo', { title: '修改' })],
  ['计划更新', (db) => updateTodoPlan(db, 'owner', { todoId: 'todo', scope: 'current' })],
  ['归属更新', (db) => updateTodoOrganization(db, 'owner', { id: 'todo', tagIds: [] })],
])('%s：任务已完成时拒绝旧编辑窗口提交，且不执行写入', async (_, update) => {
  const db = { query: vi.fn().mockResolvedValue([[{ id: 'todo', status: 'completed', plan_version: 2 }]]) };
  await expect(update(db)).rejects.toMatchObject({ code: 'TODO_COMPLETED_READ_ONLY', status: 409 });
  expect(db.query).toHaveBeenCalledTimes(1);
  expect(db.query.mock.calls[0][0]).toContain('FOR UPDATE');
});
