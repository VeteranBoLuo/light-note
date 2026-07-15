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
    store.quickCaptureVisible = true;
    store.quickCaptureType = 'file';
    const before = store.requestId;
    store.resetForOwner('user-b');
    expect(store.ownerId).toBe('user-b');
    expect(store.items).toEqual([]);
    expect(store.selectedKeys).toEqual([]);
    expect(store.quickCaptureVisible).toBe(false);
    expect(store.quickCaptureType).toBe('note');
    expect(store.requestId).toBe(before + 1);
  });

  it('快速收集可以由入口指定默认资源类型', () => {
    const store = useInboxStore();
    store.openQuickCapture('todo');
    expect(store.quickCaptureType).toBe('todo');
    expect(store.quickCaptureVisible).toBe(true);
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

  it('刷新全量列表后清空旧选择', async () => {
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

  it('全选超过 50 项时按后端上限分批完成并只刷新一次', async () => {
    const store = useInboxStore();
    const items = Array.from({ length: 51 }, (_, index) => ({
      resourceType: 'note' as const,
      resourceId: `n${index}`,
    }));
    completeInbox
      .mockResolvedValueOnce({ status: 200, data: { completed: 50 } })
      .mockResolvedValueOnce({ status: 200, data: { completed: 1 } });
    listInbox.mockResolvedValueOnce(successList([]));

    await expect(store.complete(items)).resolves.toBe(51);
    expect(completeInbox).toHaveBeenCalledTimes(2);
    expect(completeInbox.mock.calls[0][0]).toHaveLength(50);
    expect(completeInbox.mock.calls[1][0]).toHaveLength(1);
    expect(listInbox).toHaveBeenCalledTimes(1);
  });

  it('列表接口异常时稳定降级且结束加载态', async () => {
    const store = useInboxStore();
    store.items = [{ resourceType: 'note', resourceId: 'existing' } as any];
    listInbox.mockRejectedValueOnce(new Error('route not ready'));
    await expect(store.refreshList()).resolves.toBe(false);
    expect(store.items.map((item) => item.resourceId)).toEqual(['existing']);
    expect(store.loading).toBe(false);
    expect(store.loadFailed).toBe(true);
  });

  it('列表重试成功后清除错误态', async () => {
    const store = useInboxStore();
    store.loadFailed = true;
    listInbox.mockResolvedValueOnce(successList([]));
    await expect(store.refreshList()).resolves.toBe(true);
    expect(store.loadFailed).toBe(false);
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
    countInbox.mockResolvedValueOnce({ status: 200, data: { pendingTotal: 2, todoPendingTotal: 3, actionTotal: 5 } });
    await store.refreshCount();
    expect(store.pendingTotal).toBe(2);
    expect(store.todoPendingTotal).toBe(3);
    expect(store.actionTotal).toBe(5);
    expect(store.typeTotals).toEqual({ bookmark: 0, note: 0, file: 0 });
  });
});
