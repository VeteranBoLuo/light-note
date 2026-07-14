import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const listInbox = vi.fn();
const countInbox = vi.fn();
const completeInbox = vi.fn();

vi.mock('@/api/inboxApi', () => ({ listInbox, countInbox, completeInbox }));

const { default: useInboxStore } = await import('./inbox');

const successList = (items: any[] = [], extra: Record<string, any> = {}) => ({
  status: 200,
  data: {
    items,
    total: items.length,
    pendingTotal: items.length,
    typeTotals: { bookmark: 0, note: items.length, file: 0 },
    ...extra,
  },
});

describe('inbox store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
  });

  it('账号切换时清空列表、选择和旧请求标识', () => {
    const store = useInboxStore();
    store.ownerId = 'user-a';
    store.items = [{ resourceType: 'note', resourceId: 'n1' } as any];
    store.selectedKeys = ['note:n1'];
    const before = store.requestId;
    store.resetForOwner('user-b');
    expect(store.ownerId).toBe('user-b');
    expect(store.items).toEqual([]);
    expect(store.selectedKeys).toEqual([]);
    expect(store.requestId).toBe(before + 1);
  });

  it('并发筛选请求只接受最后一次响应', async () => {
    const store = useInboxStore();
    let resolveFirst: (value: any) => void = () => {};
    listInbox
      .mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(successList([{ resourceType: 'note', resourceId: 'latest', title: '新结果' }]));
    const first = store.refreshList();
    const second = store.refreshList();
    await second;
    resolveFirst(successList([{ resourceType: 'note', resourceId: 'stale', title: '旧结果' }]));
    await first;
    expect(store.items.map((item) => item.resourceId)).toEqual(['latest']);
    expect(store.loading).toBe(false);
  });

  it('翻页刷新后清空跨页选择', async () => {
    const store = useInboxStore();
    store.selectedKeys = ['note:n1'];
    listInbox.mockResolvedValueOnce(successList([{ resourceType: 'note', resourceId: 'n2' }]));
    await store.refreshList();
    expect(store.selectedKeys).toEqual([]);
  });

  it('完成接口失败时不乐观修改本地列表', async () => {
    const store = useInboxStore();
    const item = { resourceType: 'note', resourceId: 'n1', title: '保留' } as any;
    store.items = [item];
    completeInbox.mockResolvedValueOnce({ status: 500, data: null });
    await expect(store.complete([item])).resolves.toBe(0);
    expect(store.items).toEqual([item]);
    expect(listInbox).not.toHaveBeenCalled();
  });

  it('列表接口异常时稳定降级且结束加载态', async () => {
    const store = useInboxStore();
    store.items = [{ resourceType: 'note', resourceId: 'existing' } as any];
    listInbox.mockRejectedValueOnce(new Error('route not ready'));
    await expect(store.refreshList()).resolves.toBe(false);
    expect(store.items.map((item) => item.resourceId)).toEqual(['existing']);
    expect(store.loading).toBe(false);
  });

  it('完成接口异常时不抛出且不修改列表', async () => {
    const store = useInboxStore();
    const item = { resourceType: 'note', resourceId: 'n1' } as any;
    store.items = [item];
    completeInbox.mockRejectedValueOnce(new Error('network error'));
    await expect(store.complete([item])).resolves.toBe(0);
    expect(store.items).toEqual([item]);
  });

  it('角标接口始终归一化缺失数量', async () => {
    const store = useInboxStore();
    countInbox.mockResolvedValueOnce({ status: 200, data: { pendingTotal: 2 } });
    await store.refreshCount();
    expect(store.pendingTotal).toBe(2);
    expect(store.typeTotals).toEqual({ bookmark: 0, note: 0, file: 0 });
  });
});
