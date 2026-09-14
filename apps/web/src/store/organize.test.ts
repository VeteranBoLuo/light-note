import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  getOrganizeIssueList: vi.fn(),
  getOrganizeSummary: vi.fn(),
}));

vi.mock('@/api/organizeApi', () => ({
  getOrganizeIssueList: mocks.getOrganizeIssueList,
  getOrganizeSummary: mocks.getOrganizeSummary,
}));

const useOrganizeStore = (await import('./organize')).default;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('organize store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('筛选切换后忽略旧请求的迟到响应', async () => {
    const first = deferred<any>();
    const second = deferred<any>();
    mocks.getOrganizeIssueList.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = useOrganizeStore();

    const oldRequest = store.loadIssue('untagged', { reset: true, keyword: '旧筛选' });
    const newRequest = store.loadIssue('untagged', { reset: true, keyword: '新筛选' });
    second.resolve({
      status: 200,
      data: { items: [{ resourceType: 'note', resourceId: 'new' }], nextCursor: null, hasMore: false },
    });
    await newRequest;
    first.resolve({
      status: 200,
      data: { items: [{ resourceType: 'note', resourceId: 'old' }], nextCursor: null, hasMore: false },
    });
    await oldRequest;

    expect(store.lists.untagged.items).toEqual([expect.objectContaining({ resourceId: 'new' })]);
    expect(store.lists.untagged.loading).toBe(false);
  });

  it('切换账号会清除摘要、列表、加载态并使在途响应失效', async () => {
    const pending = deferred<any>();
    mocks.getOrganizeIssueList.mockReturnValueOnce(pending.promise);
    const store = useOrganizeStore();
    store.resetForOwner('user-a');
    const request = store.loadIssue('untagged', { reset: true });

    store.resetForOwner('user-b');
    pending.resolve({
      status: 200,
      data: { items: [{ resourceType: 'bookmark', resourceId: 'user-a-item' }], nextCursor: null, hasMore: false },
    });
    await request;

    expect(store.ownerKey).toBe('user-b');
    expect(store.summary).toBeNull();
    expect(store.lists.untagged).toMatchObject({ items: [], loading: false, loadingMore: false, error: false });
  });

  it('汇总整理中心内的待整理和资源治理事项数', () => {
    const store = useOrganizeStore();
    store.summary = {
      pendingShortcut: { state: 'ready', count: 7, route: '/organize?issue=pending' },
      totals: { findingTotal: 12 },
    } as any;

    expect(store.attentionCount).toBe(19);
  });

  it('摘要加载中复用当前请求，不重复发起相同统计', async () => {
    const pending = deferred<any>();
    mocks.getOrganizeSummary.mockReturnValueOnce(pending.promise);
    const store = useOrganizeStore();

    const firstLoad = store.loadSummary();
    await expect(store.loadSummary()).resolves.toBe(false);
    pending.resolve({
      status: 200,
      data: { pendingShortcut: { count: 1 }, totals: { findingTotal: 0 } },
    });

    await expect(firstLoad).resolves.toBe(true);
    expect(mocks.getOrganizeSummary).toHaveBeenCalledTimes(1);
  });

  it('重复点击加载更多不会废弃在途请求或把 loadingMore 卡死', async () => {
    const pending = deferred<any>();
    mocks.getOrganizeIssueList.mockReturnValueOnce(pending.promise);
    const store = useOrganizeStore();
    store.lists.untagged.items = [{ resourceType: 'note', resourceId: 'first' } as any];
    store.lists.untagged.cursor = 'cursor-1';
    store.lists.untagged.hasMore = true;

    const firstLoad = store.loadIssue('untagged', { reset: false });
    await expect(store.loadIssue('untagged', { reset: false })).resolves.toBe(false);
    pending.resolve({
      status: 200,
      data: { items: [{ resourceType: 'note', resourceId: 'second' }], nextCursor: null, hasMore: false },
    });

    await expect(firstLoad).resolves.toBe(true);
    expect(store.lists.untagged.items).toEqual([
      expect.objectContaining({ resourceId: 'first' }),
      expect.objectContaining({ resourceId: 'second' }),
    ]);
    expect(store.lists.untagged.loadingMore).toBe(false);
    expect(mocks.getOrganizeIssueList).toHaveBeenCalledTimes(1);
  });
  it('失败重试区分筛选刷新与游标续页，保留已有内容', async () => {
    const store = useOrganizeStore();
    store.lists.untagged.items = [{ resourceType: 'note', resourceId: 'first' } as any];
    store.lists.untagged.cursor = 'cursor-1';
    store.lists.untagged.hasMore = true;
    mocks.getOrganizeIssueList.mockRejectedValueOnce(new Error('offline'));
    await store.loadIssue('untagged', { reset: false });
    expect(store.lists.untagged).toMatchObject({ error: true, retryReset: false, cursor: 'cursor-1' });
    mocks.getOrganizeIssueList.mockResolvedValueOnce({ status: 500 });
    await store.loadIssue('untagged', { reset: true, keyword: '新筛选' });
    expect(store.lists.untagged).toMatchObject({ error: true, retryReset: true });
    expect(store.lists.untagged.items).toHaveLength(1);
    mocks.getOrganizeIssueList.mockResolvedValueOnce({
      status: 200,
      data: { items: [], hasMore: false, nextCursor: null },
    });
    await store.loadIssue('untagged', { reset: store.lists.untagged.retryReset, keyword: '新筛选' });
    expect(mocks.getOrganizeIssueList).toHaveBeenLastCalledWith(
      'untagged',
      expect.objectContaining({ cursor: null, keyword: '新筛选' }),
    );
    expect(store.lists.untagged).toMatchObject({ error: false, items: [], hasMore: false });
  });
});
