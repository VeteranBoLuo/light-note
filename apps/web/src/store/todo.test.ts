import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const listTodos = vi.fn();
const countTodos = vi.fn();
const completeTodo = vi.fn();
const reopenTodo = vi.fn();
const updateTodo = vi.fn();
const deleteTodo = vi.fn();
const createTodo = vi.fn();
const batchSetTodoStatus = vi.fn();
const batchDeleteTodos = vi.fn();
const reorderTodos = vi.fn();
const restoreTodo = vi.fn();
const batchRestoreTodos = vi.fn();
const snoozeTodo = vi.fn();

vi.mock('@/api/todoApi', () => ({
  listTodos,
  countTodos,
  completeTodo,
  reopenTodo,
  updateTodo,
  deleteTodo,
  createTodo,
  batchSetTodoStatus,
  batchDeleteTodos,
  reorderTodos,
  restoreTodo,
  batchRestoreTodos,
  snoozeTodo,
}));

const { default: useTodoStore } = await import('./todo');

describe('todo store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('账号切换时清空待办数据和筛选条件', () => {
    const store = useTodoStore();
    store.ownerId = 'user-a';
    store.items = [{ id: 'todo-1' } as any];
    store.status = 'completed';
    store.keyword = '旧搜索';
    store.resetForOwner('user-b');
    expect(store.items).toEqual([]);
    expect(store.status).toBe('all');
    expect(store.keyword).toBe('');
  });

  it('并发刷新只接受最后一次响应', async () => {
    const store = useTodoStore();
    let resolveFirst: (value: any) => void = () => {};
    listTodos
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({ status: 200, data: { items: [{ id: 'latest' }], total: 1, pendingTotal: 1 } });
    const first = store.refreshList();
    const second = store.refreshList();
    await second;
    resolveFirst({ status: 200, data: { items: [{ id: 'stale' }], total: 1, pendingTotal: 1 } });
    await first;
    expect(store.items.map((item) => item.id)).toEqual(['latest']);
  });

  it('资源中心总览查询未完成项时保留当前全部筛选', async () => {
    const store = useTodoStore();
    listTodos.mockResolvedValueOnce({ status: 200, data: { items: [], total: 0, pendingTotal: 0 } });

    await store.refreshList({ status: 'pending', preserveStatus: true });

    expect(store.status).toBe('all');
    expect(listTodos).toHaveBeenCalledWith({ status: 'pending', keyword: '', sort: 'smart' });
  });

  it('删除成功后重新获取当前列表', async () => {
    const store = useTodoStore();
    const item = { id: 'todo-1' } as any;
    deleteTodo.mockResolvedValueOnce({ status: 200, data: { affected: 1 } });
    listTodos.mockResolvedValueOnce({ status: 200, data: { items: [], total: 0, pendingTotal: 0 } });
    await expect(store.remove(item)).resolves.toBe(true);
    expect(listTodos).toHaveBeenCalledTimes(1);
  });

  it('撤销批量完成通过单个事务请求恢复并回滚自动生成实例', async () => {
    const store = useTodoStore();
    batchSetTodoStatus.mockResolvedValueOnce({ status: 200, data: { affected: 2 } });
    listTodos.mockResolvedValueOnce({ status: 200, data: { items: [], total: 0, pendingTotal: 0 } });
    await expect(store.reopenMany(['todo-1', 'todo-2'])).resolves.toBe(true);
    expect(batchSetTodoStatus).toHaveBeenCalledWith(['todo-1', 'todo-2'], 'pending', { undoCompletion: true });
  });

  it('删除撤销逐项恢复后刷新，并在任一恢复失败时如实返回 false', async () => {
    const store = useTodoStore();
    batchRestoreTodos.mockResolvedValueOnce({ status: 200, data: { affected: 1 } });
    listTodos.mockResolvedValueOnce({ status: 200, data: { items: [], total: 0, pendingTotal: 0 } });
    await expect(store.restoreMany(['todo-1', 'todo-2'])).resolves.toBe(false);
    expect(batchRestoreTodos).toHaveBeenCalledWith(['todo-1', 'todo-2']);
  });
});
