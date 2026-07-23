import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const listTodos = vi.fn();
const countTodos = vi.fn();
const completeTodo = vi.fn();
const reopenTodo = vi.fn();
const updateTodo = vi.fn();
const deleteTodo = vi.fn();

vi.mock('@/api/todoApi', () => ({
  listTodos,
  countTodos,
  completeTodo,
  reopenTodo,
  updateTodo,
  deleteTodo,
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
});
