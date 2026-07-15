import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { loadBookmarkIconsProgressively, needsBookmarkIconRefresh } from './commonApi.ts';

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
  });

  it('普通用户的管理员只读预览不触发图标写入请求', async () => {
    mocks.isAdminLoginPreview.mockReturnValue(true);
    const applyIcon = vi.fn();

    await loadBookmarkIconsProgressively(
      [{ id: 'bookmark-1', url: 'https://example.com' }],
      applyIcon,
    );

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

    await loadBookmarkIconsProgressively(
      [{ id: 'bookmark-1', url: 'https://example.com' }],
      applyIcon,
    );

    expect(mocks.apiBasePost).toHaveBeenCalledOnce();
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
