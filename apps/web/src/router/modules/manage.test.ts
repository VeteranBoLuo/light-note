import { describe, expect, it, vi } from 'vitest';
import manageRouter, { resolveBookmarkManagementEntry } from './manage';

vi.mock('@/utils/tagSpaceNavigation', () => ({
  resolveTagSpaceEntryId: vi.fn(),
}));

describe('书签管理兼容入口', () => {
  it('桌面端在路由提交前进入书签页管理模式并保留查询参数', () => {
    expect(resolveBookmarkManagementEntry({ query: { snapshot: 'bookmark-1' } }, 1440)).toEqual({
      name: 'home',
      query: { snapshot: 'bookmark-1', mode: 'manage' },
      replace: true,
    });
  });

  it('移动端继续使用原书签管理页面', () => {
    expect(resolveBookmarkManagementEntry({ query: {} }, 390)).toBe(true);
  });

  it('平板继续使用原独立管理页，只在真正桌面合并浏览与管理', () => {
    expect(resolveBookmarkManagementEntry({ query: {} }, 1024)).toBe(true);
    expect(resolveBookmarkManagementEntry({ query: {} }, 1280, true)).toBe(true);
    expect(resolveBookmarkManagementEntry({ query: {} }, 1280, false)).toEqual({
      name: 'home',
      query: { mode: 'manage' },
      replace: true,
    });
  });

  it('兼容守卫只挂在书签管理路由，不影响书签编辑页', () => {
    const bookmarkManagement = manageRouter.children?.find((route) => route.name === 'bookmarkMg');
    const bookmarkEditor = manageRouter.children?.find((route) => route.name === 'bookmarkEditMg');

    expect(typeof bookmarkManagement?.beforeEnter).toBe('function');
    expect(bookmarkEditor?.beforeEnter).toBeUndefined();
  });
});
