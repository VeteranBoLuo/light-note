import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const listInbox = vi.fn();
const countInbox = vi.fn();
const completeInbox = vi.fn();
const listTodos = vi.fn();

vi.mock('@/api/inboxApi', () => ({ listInbox, countInbox, completeInbox }));
vi.mock('@/api/todoApi', () => ({ listTodos }));

const { default: useInboxStore } = await import('./inbox');
const { default: useTodoStore } = await import('./todo');

const okList = (items: any[]) => ({ status: 200, data: { items, total: items.length } });

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
});

describe('待整理列表的静默刷新', () => {
  it('silent 时请求过程中不进 loading，页面因此不闪骨架屏', async () => {
    const store = useInboxStore();
    let loadingDuringRequest: boolean | null = null;
    listInbox.mockImplementation(() => {
      loadingDuringRequest = store.loading;
      return Promise.resolve(okList([{ id: 'a' }]));
    });

    await store.refreshList({ silent: true });

    expect(loadingDuringRequest).toBe(false);
    expect(store.items).toHaveLength(1);
  });

  it('不传 silent 时仍走 loading，保持原有骨架行为', async () => {
    const store = useInboxStore();
    let loadingDuringRequest: boolean | null = null;
    listInbox.mockImplementation(() => {
      loadingDuringRequest = store.loading;
      return Promise.resolve(okList([]));
    });

    await store.refreshList();

    expect(loadingDuringRequest).toBe(true);
    expect(store.loading).toBe(false);
  });

  it('静默刷新失败时保留旧列表，只标记 loadFailed 由顶部横幅提示', async () => {
    const store = useInboxStore();
    listInbox.mockResolvedValueOnce(okList([{ id: 'a' }, { id: 'b' }]));
    await store.refreshList();
    expect(store.items).toHaveLength(2);

    listInbox.mockRejectedValueOnce(new Error('network'));
    await expect(store.refreshList({ silent: true })).resolves.toBe(false);

    expect(store.items).toHaveLength(2);
    expect(store.loadFailed).toBe(true);
  });
});

describe('待办列表的静默刷新', () => {
  it('silent 时不进 loading', async () => {
    const store = useTodoStore();
    let loadingDuringRequest: boolean | null = null;
    listTodos.mockImplementation(() => {
      loadingDuringRequest = store.loading;
      return Promise.resolve(okList([{ id: 't1' }]));
    });

    await store.refreshList({ silent: true });

    expect(loadingDuringRequest).toBe(false);
    expect(store.items).toHaveLength(1);
  });

  it('silent 不影响 status/keyword/sort 等既有选项处理', async () => {
    const store = useTodoStore();
    listTodos.mockResolvedValue(okList([]));

    await store.refreshList({ status: 'completed', keyword: '周报', silent: true });

    expect(store.status).toBe('completed');
    expect(store.keyword).toBe('周报');
    expect(listTodos).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', keyword: '周报' }));
  });

  it('静默刷新失败时保留旧待办', async () => {
    const store = useTodoStore();
    listTodos.mockResolvedValueOnce(okList([{ id: 't1' }, { id: 't2' }]));
    await store.refreshList();
    expect(store.items).toHaveLength(2);

    listTodos.mockResolvedValueOnce({ status: 500, data: null });
    await expect(store.refreshList({ silent: true })).resolves.toBe(false);

    expect(store.items).toHaveLength(2);
  });
});
