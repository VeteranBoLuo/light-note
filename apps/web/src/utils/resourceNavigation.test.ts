import { describe, expect, it } from 'vitest';
import { resolvePendingResourcesRoute, resolveResourceRoute } from './resourceNavigation';

describe('resourceNavigation', () => {
  it('桌面端和移动端待整理入口都进入整理中心', () => {
    expect(resolvePendingResourcesRoute(true)).toEqual({ path: '/organize', query: { issue: 'pending' } });
    expect(resolvePendingResourcesRoute(false)).toEqual({ path: '/organize', query: { issue: 'pending' } });
  });

  it('资源详情仍按资源类型解析标准地址', () => {
    expect(resolveResourceRoute({ type: 'bookmark', id: 'bookmark-1' })).toEqual({
      path: '/manage/editBookmark/bookmark-1',
    });
    expect(resolveResourceRoute({ type: 'note', id: 'note-1' })).toEqual({ path: '/noteLibrary/note-1' });
    expect(resolveResourceRoute({ type: 'file', id: 'file-1', title: '资料.pdf' })).toEqual({
      path: '/cloudSpace',
      query: { fileId: 'file-1', fileName: '资料.pdf' },
    });
  });
});
