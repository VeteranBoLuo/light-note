import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const listTodos = vi.fn();
const getTodoWorkspace = vi.fn();
const getTodoWorkspaceGroup = vi.fn();
const getTodoWorkspaceSeries = vi.fn();
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
  getTodoWorkspace,
  getTodoWorkspaceGroup,
  getTodoWorkspaceSeries,
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
    store.sort = 'newest';
    store.keyword = '旧搜索';
    store.resetForOwner('user-b');
    expect(store.items).toEqual([]);
    expect(store.status).toBe('all');
    expect(store.sort).toBe('smart');
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

  it('游客写入被预览拦截时只返回 preview，不刷新列表', async () => {
    const store = useTodoStore();
    deleteTodo.mockResolvedValueOnce({ status: 'preview', data: null });

    await expect(store.remove({ id: 'todo-visitor' } as any)).resolves.toBe('preview');
    expect(listTodos).not.toHaveBeenCalled();
  });

  it('preserveStatus 拉取后,后续无参刷新沿用真实请求口径而非页签状态', async () => {
    const store = useTodoStore();
    listTodos.mockResolvedValue({ status: 200, data: { items: [], total: 0, pendingTotal: 0 } });
    // 「待处理」全部页签:页签仍是 all,但只取未完成
    await store.refreshList({ status: 'pending', preserveStatus: true });
    expect(store.status).toBe('all');
    expect(listTodos).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'pending' }));

    reorderTodos.mockResolvedValueOnce({ status: 200, data: {} });
    await store.reorder([{ id: 'todo-1', priority: 2 }]);
    // 改优先级后的刷新不能退回 all,否则已完成待办会重新出现在列表里
    expect(listTodos).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'pending' }));

    // 显式切到已完成页签时,口径要跟着切换
    await store.refreshList({ status: 'completed' });
    expect(store.status).toBe('completed');
    expect(listTodos).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed' }));
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

describe('workspace subitem safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });
  it('locks each parent, retains checked values on failure and retries the requested payload', async () => {
    const store = useTodoStore();
    store.resetForOwner('owner');
    const item = { id: 'task', status: 'pending', checklist: [{ id: 'child', text: 'child', done: false }] } as any;
    store.items = [item];
    const next = [{ ...item.checklist[0], done: true }];
    let fail!: (value: unknown) => void;
    updateTodo.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          fail = resolve;
        }),
    );
    const pending = store.updateChecklist(item, next);
    expect(await store.updateChecklist(item, next)).toBe(false);
    expect(updateTodo).toHaveBeenCalledTimes(1);
    expect(item.checklist[0].done).toBe(false);
    fail({ status: 500 });
    await pending;
    expect(store.checklistErrors.task).toEqual(next);
    expect(item.checklist[0].done).toBe(false);
    updateTodo.mockResolvedValueOnce({ status: 200 });
    expect(await store.updateChecklist(item, store.checklistErrors.task)).toBe(true);
    expect(item.checklist[0].done).toBe(true);
    expect(store.checklistErrors.task).toBeUndefined();
  });
  it('completed parents and responses from a previous owner cannot change children', async () => {
    const store = useTodoStore();
    store.resetForOwner('owner');
    const item = { id: 'task', status: 'completed', checklist: [] } as any;
    expect(await store.updateChecklist(item, [])).toBe(false);
    expect(updateTodo).not.toHaveBeenCalled();
    item.status = 'pending';
    let finish!: (v: unknown) => void;
    updateTodo.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const request = store.updateChecklist(item, [{ id: 'a', text: 'a', done: true }]);
    store.resetForOwner('other');
    finish({ status: 200 });
    await request;
    expect(item.checklist).toEqual([]);
    expect(store.checklistPending).toEqual({});
  });
  it('workspace totals come from the server and pagination deduplicates parents', async () => {
    const store = useTodoStore();
    store.workspaceEnabled = true;
    getTodoWorkspace.mockResolvedValueOnce({
      status: 200,
      data: {
        items: [{ id: 'a' }],
        nextCursor: 'next',
        total: 80,
        overview: { allTotal: 100 },
        statusTotals: { pending: 80, completed: 9, all: 89 },
      },
    });
    await store.refreshList({ status: 'pending' });
    expect(store.total).toBe(80);
    expect(store.pendingTotal).toBe(100);
    expect(store.statusTotals.completed).toBe(9);
    getTodoWorkspace.mockResolvedValueOnce({
      status: 200,
      data: { items: [{ id: 'a' }, { id: 'b' }], nextCursor: null },
    });
    await store.loadMore();
    expect(store.items.map((item) => item.id)).toEqual(['a', 'b']);
  });
});

describe('series workspace pagination', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setActivePinia(createPinia());
  });
  const summary = {
    status: 200,
    data: {
      groups: [
        { key: 'focus', nodeCount: 40, instanceCount: 200 },
        { key: 'unassigned', nodeCount: 1, instanceCount: 1 },
      ],
      statusTotals: { pending: 201, completed: 0, all: 201 },
    },
  };
  const node = (id: string) => ({ kind: 'item', key: id, item: { id, status: 'pending' } });
  async function setup() {
    const store = useTodoStore();
    store.workspaceEnabled = true;
    store.seriesPresentation = true;
    getTodoWorkspace.mockResolvedValue(summary);
    await store.refreshList({ status: 'pending' });
    return store;
  }
  it('loads groups lazily, independently and deduplicates repeated pages', async () => {
    const store = await setup();
    expect(store.items).toEqual([]);
    expect(store.total).toBe(201);
    expect(getTodoWorkspaceGroup).not.toHaveBeenCalled();
    getTodoWorkspaceGroup.mockResolvedValueOnce({
      status: 200,
      data: { nodes: [node('a')], nextCursor: 'next', total: 40 },
    });
    await store.loadGroup('focus');
    expect(store.groups[1].loaded).toBe(false);
    getTodoWorkspaceGroup.mockResolvedValueOnce({ status: 200, data: { nodes: [node('a'), node('b')], total: 40 } });
    await store.loadGroup('focus');
    expect(store.items.map((item) => item.id)).toEqual(['a', 'b']);
  });
  it('blocks duplicate requests, retains rows on failure and retries only explicitly', async () => {
    const store = await setup();
    let resolve: (value: unknown) => void = () => {};
    getTodoWorkspaceGroup.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const first = store.loadGroup('focus');
    await store.loadGroup('focus');
    expect(getTodoWorkspaceGroup).toHaveBeenCalledTimes(1);
    resolve({ status: 200, data: { nodes: [node('a')], nextCursor: 'next' } });
    await first;
    getTodoWorkspaceGroup.mockResolvedValueOnce({ status: 500 });
    await store.loadGroup('focus');
    await store.loadGroup('focus');
    expect(getTodoWorkspaceGroup).toHaveBeenCalledTimes(2);
    expect(store.items[0].id).toBe('a');
    getTodoWorkspaceGroup.mockResolvedValueOnce({ status: 200, data: { nodes: [node('b')] } });
    await store.loadGroup('focus', true);
    expect(store.items.map((item) => item.id)).toEqual(['a', 'b']);
  });
  it('discards a page after an owner switch', async () => {
    const store = await setup();
    let resolve: (value: unknown) => void = () => {};
    getTodoWorkspaceGroup.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = store.loadGroup('focus');
    store.resetForOwner('new-owner');
    resolve({ status: 200, data: { nodes: [node('private')] } });
    await pending;
    expect(store.items).toEqual([]);
    expect(store.groups).toEqual([]);
  });
  it('refreshes the loaded prefix atomically and preserves it if verification fails', async () => {
    const store = await setup();
    getTodoWorkspaceGroup.mockResolvedValueOnce({
      status: 200,
      data: { nodes: [node('a'), node('b')], nextCursor: 'next' },
    });
    await store.loadGroup('focus');
    getTodoWorkspaceGroup.mockResolvedValueOnce({ status: 500 });
    expect(await store.refreshList()).toBe(false);
    expect(store.items.map((item) => item.id)).toEqual(['a', 'b']);
    getTodoWorkspaceGroup.mockResolvedValueOnce({ status: 200, data: { nodes: [node('b')], nextCursor: 'next' } });
    getTodoWorkspaceGroup.mockResolvedValueOnce({ status: 200, data: { nodes: [node('c')] } });
    expect(await store.refreshList()).toBe(true);
    expect(store.items.map((item) => item.id)).toEqual(['b', 'c']);
  });
  it('keeps independent series scopes and ignores replaced in-flight series pages', async () => {
    const store = await setup();
    let resolve: (value: unknown) => void = () => {};
    getTodoWorkspaceSeries.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const old = store.loadSeriesPage('scope-a', { seriesId: 'a' }, true);
    getTodoWorkspaceSeries.mockResolvedValueOnce({ status: 200, data: { items: [{ id: 'new' }], total: 1 } });
    await store.loadSeriesPage('scope-a', { seriesId: 'a' }, true);
    resolve({ status: 200, data: { items: [{ id: 'old' }], total: 1 } });
    await old;
    expect(store.seriesPages['scope-a'].items[0].id).toBe('new');
  });
});
