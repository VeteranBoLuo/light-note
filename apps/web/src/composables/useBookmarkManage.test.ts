import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiBasePost: vi.fn(),
  apiQueryPost: vi.fn(),
  loadBookmarkIconsProgressively: vi.fn(),
  recordOperation: vi.fn(),
}));

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/store', () => ({
  useUserStore: () => ({ id: 'user-1' }),
}));

vi.mock('@/http/request.ts', () => ({
  apiBasePost: mocks.apiBasePost,
  apiQueryPost: mocks.apiQueryPost,
}));

vi.mock('@/api/commonApi.ts', () => ({
  loadBookmarkIconsProgressively: mocks.loadBookmarkIconsProgressively,
  recordOperation: mocks.recordOperation,
}));

vi.mock('@/composables/useGuestGuard', () => ({
  blockGuestWrite: vi.fn(() => false),
}));

vi.mock('@/components/base/BasicComponents/BModal/Alert.ts', () => ({
  default: { alert: vi.fn() },
}));

vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: vi.fn() },
}));

import { useBookmarkManage } from './useBookmarkManage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('useBookmarkManage loading state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('首次请求完成前保持骨架态，完成后才允许显示列表或空状态', async () => {
    const request = deferred<any>();
    mocks.apiQueryPost.mockReturnValueOnce(request.promise);
    const state = useBookmarkManage();

    expect(state.initialLoading.value).toBe(true);
    expect(state.hasLoaded.value).toBe(false);

    const reloadPromise = state.reloadBookmarks({ refreshIcons: false });
    expect(state.loading.value).toBe(true);
    expect(state.initialLoading.value).toBe(true);

    request.resolve({
      status: 200,
      data: { items: [{ id: 'bookmark-1', name: 'Light Note', url: 'https://example.com' }] },
    });
    await reloadPromise;

    expect(state.hasLoaded.value).toBe(true);
    expect(state.initialLoading.value).toBe(false);
    expect(state.loading.value).toBe(false);
    expect(state.loadError.value).toBe(false);
    expect(state.bookmarks.value).toHaveLength(1);
  });

  it('首次请求失败后退出骨架态并进入可重试错误态', async () => {
    mocks.apiQueryPost.mockResolvedValueOnce({ status: 500 });
    const state = useBookmarkManage();

    await expect(state.reloadBookmarks()).resolves.toBe(false);

    expect(state.hasLoaded.value).toBe(true);
    expect(state.initialLoading.value).toBe(false);
    expect(state.loadError.value).toBe(true);
    expect(state.loading.value).toBe(false);
  });

  it('已有数据刷新时保留内容，只标记为后台刷新', async () => {
    mocks.apiQueryPost.mockResolvedValueOnce({
      status: 200,
      data: { items: [{ id: 'bookmark-1', name: 'Existing', url: 'https://example.com' }] },
    });
    const state = useBookmarkManage();
    await state.reloadBookmarks({ refreshIcons: false });

    const request = deferred<any>();
    mocks.apiQueryPost.mockReturnValueOnce(request.promise);
    const reloadPromise = state.reloadBookmarks({ refreshIcons: false });

    expect(state.initialLoading.value).toBe(false);
    expect(state.refreshing.value).toBe(true);
    expect(state.bookmarks.value[0]?.name).toBe('Existing');

    request.resolve({
      status: 200,
      data: { items: [{ id: 'bookmark-2', name: 'Updated', url: 'https://openai.com' }] },
    });
    await reloadPromise;

    expect(state.refreshing.value).toBe(false);
    expect(state.bookmarks.value[0]?.name).toBe('Updated');
  });

  it('并发刷新时忽略较早返回的旧响应', async () => {
    const olderRequest = deferred<any>();
    const newerRequest = deferred<any>();
    mocks.apiQueryPost
      .mockReturnValueOnce(olderRequest.promise)
      .mockReturnValueOnce(newerRequest.promise);
    const state = useBookmarkManage();

    const olderReload = state.reloadBookmarks({ refreshIcons: false });
    const newerReload = state.reloadBookmarks({ refreshIcons: false });
    newerRequest.resolve({
      status: 200,
      data: { items: [{ id: 'bookmark-new', name: 'Newer', url: 'https://new.example' }] },
    });
    await newerReload;
    olderRequest.resolve({
      status: 200,
      data: { items: [{ id: 'bookmark-old', name: 'Older', url: 'https://old.example' }] },
    });
    await olderReload;

    expect(state.bookmarks.value).toEqual([
      expect.objectContaining({ id: 'bookmark-new', name: 'Newer' }),
    ]);
    expect(state.loading.value).toBe(false);
    expect(state.loadError.value).toBe(false);
  });
});
