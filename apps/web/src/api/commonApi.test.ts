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

import { loadBookmarkIconsProgressively } from './commonApi.ts';

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
});
