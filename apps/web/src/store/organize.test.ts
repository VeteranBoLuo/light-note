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
});
