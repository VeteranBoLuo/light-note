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

  it('返回时按原筛选重新读取已加载范围，原子替换已加标签或删除的旧资料', async () => {
    const store = useOrganizeStore();
    store.lists.untagged.items = [{ resourceType: 'note', resourceId: 'removed' } as any];
    const later = deferred<any>();
    mocks.getOrganizeIssueList
      .mockResolvedValueOnce({
        status: 200,
        data: {
          items: [{ resourceType: 'note', resourceId: 'current-a' }],
          nextCursor: 'page2',
          hasMore: true,
        },
      })
      .mockReturnValueOnce(later.promise);
    const loading = store.loadIssue('untagged', {
      reset: true,
      keyword: '项目',
      resourceType: 'note',
      restoreCount: 2,
    });
    await vi.waitFor(() => expect(mocks.getOrganizeIssueList).toHaveBeenCalledTimes(2));
    expect(store.lists.untagged).toMatchObject({ items: [], loading: true });
    later.resolve({
      status: 200,
      data: {
        items: [{ resourceType: 'note', resourceId: 'current-b' }],
        nextCursor: 'page3',
        hasMore: true,
      },
    });
    await expect(loading).resolves.toBe(true);
    expect(store.lists.untagged).toMatchObject({
      items: [{ resourceId: 'current-a' }, { resourceId: 'current-b' }],
      cursor: 'page3',
      hasMore: true,
      loading: false,
    });
    expect(mocks.getOrganizeIssueList.mock.calls.map(([, options]) => options)).toEqual([
      expect.objectContaining({ cursor: null, keyword: '项目', resourceType: 'note', limit: 20 }),
      expect.objectContaining({ cursor: 'page2', keyword: '项目', resourceType: 'note', limit: 20 }),
    ]);
  });

  it('新列表缩短或清空时停止续页，不重新放回旧资料', async () => {
    const store = useOrganizeStore();
    store.lists.untagged.items = [{ resourceType: 'note', resourceId: 'removed' } as any];
    mocks.getOrganizeIssueList.mockResolvedValueOnce({ status: 200, data: { items: [], hasMore: false } });
    await expect(store.loadIssue('untagged', { restoreCount: 60 })).resolves.toBe(true);
    expect(store.lists.untagged).toMatchObject({ items: [], hasMore: false, cursor: null, error: false });
    expect(mocks.getOrganizeIssueList).toHaveBeenCalledTimes(1);
  });

  it('恢复后续页失败不展示旧快照，重试从首屏重新读取完整范围', async () => {
    const store = useOrganizeStore();
    store.lists.untagged.items = [{ resourceType: 'note', resourceId: 'removed' } as any];
    mocks.getOrganizeIssueList
      .mockResolvedValueOnce({
        status: 200,
        data: {
          items: [{ resourceType: 'note', resourceId: 'first' }],
          nextCursor: 'next',
          hasMore: true,
        },
      })
      .mockRejectedValueOnce(new Error('offline'));
    await expect(store.loadIssue('untagged', { restoreCount: 2 })).resolves.toBe(false);
    expect(store.lists.untagged).toMatchObject({ items: [], error: true, retryReset: true, loading: false });
    mocks.getOrganizeIssueList.mockResolvedValueOnce({ status: 200, data: { items: [], hasMore: false } });
    await store.loadIssue('untagged', { restoreCount: 2 });
    expect(mocks.getOrganizeIssueList).toHaveBeenLastCalledWith('untagged', expect.objectContaining({ cursor: null }));
  });

  it.each(['filter', 'owner'])('恢复中切换 %s，旧续页不能覆盖当前列表', async (change) => {
    const store = useOrganizeStore();
    store.resetForOwner('owner-a');
    const oldPage = deferred<any>();
    mocks.getOrganizeIssueList
      .mockResolvedValueOnce({
        status: 200,
        data: {
          items: [{ resourceType: 'note', resourceId: 'old' }],
          nextCursor: 'page2',
          hasMore: true,
        },
      })
      .mockReturnValueOnce(oldPage.promise);
    const old = store.loadIssue('untagged', { keyword: '旧条件', restoreCount: 2 });
    await vi.waitFor(() => expect(mocks.getOrganizeIssueList).toHaveBeenCalledTimes(2));
    mocks.getOrganizeIssueList.mockResolvedValueOnce({
      status: 200,
      data: {
        items: [{ resourceType: 'note', resourceId: 'new' }],
        hasMore: false,
      },
    });
    if (change === 'owner') store.resetForOwner('owner-b');
    await store.loadIssue('untagged', { keyword: '新条件' });
    oldPage.resolve({ status: 200, data: { items: [{ resourceType: 'note', resourceId: 'late' }], hasMore: false } });
    await expect(old).resolves.toBe(false);
    expect(store.lists.untagged.items).toEqual([expect.objectContaining({ resourceId: 'new' })]);
  });

  it('异常游标不前进时停止恢复并可重试，避免无限请求', async () => {
    const store = useOrganizeStore();
    mocks.getOrganizeIssueList.mockResolvedValue({
      status: 200,
      data: {
        items: [{ resourceType: 'note', resourceId: 'same' }],
        nextCursor: 'same-cursor',
        hasMore: true,
      },
    });
    await expect(store.loadIssue('untagged', { restoreCount: 60 })).resolves.toBe(false);
    expect(mocks.getOrganizeIssueList).toHaveBeenCalledTimes(2);
    expect(store.lists.untagged).toMatchObject({ items: [], error: true, loading: false, retryReset: true });
  });
});
