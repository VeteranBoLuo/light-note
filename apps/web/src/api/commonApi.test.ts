import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBookmarkIconRuntimeState, resetBookmarkIconRuntime } from '@/composables/bookmarkIconRuntime.ts';

const mocks = vi.hoisted(() => ({
  apiBasePost: vi.fn(),
  isAdminLoginPreview: vi.fn(),
  user: { visitorWorkspace: false },
}));

vi.mock('@/http/request.ts', () => ({
  apiBaseGet: vi.fn(),
  apiBasePost: mocks.apiBasePost,
}));

vi.mock('@/utils/authStorage.ts', () => ({
  isAdminLoginPreview: mocks.isAdminLoginPreview,
}));

vi.mock('@/store/useUser.ts', () => ({
  default: () => mocks.user,
}));

import { loadBookmarkIconsProgressively, needsBookmarkIconRefresh, refreshBookmarkIconAfterSave } from './commonApi.ts';

describe('needsBookmarkIconRefresh', () => {
  const now = Date.parse('2026-07-15T12:00:00Z');

  it('已有图标满 30 天后静默刷新', () => {
    expect(
      needsBookmarkIconRefresh(
        {
          id: 'bookmark-1',
          url: 'https://example.com',
          iconUrl: '/uploads/bookmark-1.png',
          iconCheckedAt: '2026-06-15T11:59:59Z',
        },
        now,
      ),
    ).toBe(true);
  });

  it('抓取失败的无图标书签一天后才重试', () => {
    const item = { id: 'bookmark-1', url: 'https://example.com', iconCheckedAt: '2026-07-15T00:00:00Z' };
    expect(needsBookmarkIconRefresh(item, now)).toBe(false);
    expect(needsBookmarkIconRefresh(item, Date.parse('2026-07-16T00:00:01Z'))).toBe(true);
  });
});

describe('loadBookmarkIconsProgressively', () => {
  beforeEach(() => {
    mocks.apiBasePost.mockReset();
    mocks.isAdminLoginPreview.mockReset();
    mocks.user.visitorWorkspace = false;
    resetBookmarkIconRuntime();
  });

  it('普通用户的管理员只读预览不触发图标写入请求', async () => {
    mocks.isAdminLoginPreview.mockReturnValue(true);
    const applyIcon = vi.fn();

    await loadBookmarkIconsProgressively([{ id: 'bookmark-1', url: 'https://example.com' }], applyIcon);

    expect(mocks.apiBasePost).not.toHaveBeenCalled();
    expect(applyIcon).not.toHaveBeenCalled();
  });

  it('游客维护工作区仍允许补全图标', async () => {
    mocks.isAdminLoginPreview.mockReturnValue(true);
    mocks.user.visitorWorkspace = true;
    mocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: [{ id: 'bookmark-1', iconUrl: 'https://example.com/favicon.ico' }],
    });
    const applyIcon = vi.fn();

    await loadBookmarkIconsProgressively([{ id: 'bookmark-1', url: 'https://example.com' }], applyIcon);

    expect(mocks.apiBasePost).toHaveBeenCalledOnce();
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/common/analyzeImgUrl',
      [{ id: 'bookmark-1', refreshMode: 'periodic' }],
      { silent: true },
    );
    expect(applyIcon).toHaveBeenCalledWith('bookmark-1', 'https://example.com/favicon.ico');
  });

  it('过期图标刷新失败时保留旧图，只推进检查时间', async () => {
    mocks.isAdminLoginPreview.mockReturnValue(false);
    const item = {
      id: 'bookmark-1',
      url: 'https://example.com',
      iconUrl: 'https://example.com/old.ico',
      iconCheckedAt: '2020-01-01T00:00:00Z',
    };
    mocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: [{ id: 'bookmark-1', iconUrl: '', iconCheckedAt: '2026-07-15T12:00:00Z' }],
    });
    const applyIcon = vi.fn();

    await loadBookmarkIconsProgressively([item], applyIcon);

    expect(applyIcon).not.toHaveBeenCalled();
    expect(item.iconUrl).toBe('https://example.com/old.ico');
    expect(item.iconCheckedAt).toBe('2026-07-15T12:00:00Z');
  });
});

describe('refreshBookmarkIconAfterSave', () => {
  beforeEach(() => {
    mocks.apiBasePost.mockReset();
    resetBookmarkIconRuntime();
  });

  it('同一书签的重复保存后请求会复用在途任务，并把结果回填到运行态', async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    mocks.apiBasePost.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const item = {
      id: 'bookmark-1',
      url: 'https://example.com',
      iconUrl: '/uploads/old.png',
    };

    const firstRequest = refreshBookmarkIconAfterSave(item);
    const secondRequest = refreshBookmarkIconAfterSave(item);

    expect(mocks.apiBasePost).toHaveBeenCalledOnce();
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/common/analyzeImgUrl',
      [{ id: 'bookmark-1', refreshMode: 'after_save' }],
      { silent: true },
    );
    expect(getBookmarkIconRuntimeState('bookmark-1')?.refreshing).toBe(true);

    resolveRequest({
      status: 200,
      data: [{ id: 'bookmark-1', iconUrl: '/uploads/new.png', iconCheckedAt: '2026-07-19T00:00:00Z' }],
    });

    await expect(firstRequest).resolves.toBe('/uploads/new.png');
    await expect(secondRequest).resolves.toBe('/uploads/new.png');
    expect(item.iconUrl).toBe('/uploads/new.png');
    expect(item.iconCheckedAt).toBe('2026-07-19T00:00:00Z');
    expect(getBookmarkIconRuntimeState('bookmark-1')).toMatchObject({
      refreshing: false,
      iconUrl: '/uploads/new.png',
      hasIconOverride: true,
    });
  });
});
