import { describe, expect, it } from 'vitest';
import { resolvePendingResourcesRoute, resolveResourceRoute } from './resourceNavigation';

describe('resourceNavigation', () => {
  it('移动端待整理入口明确进入资源中心待整理分区，桌面端保持原地址', () => {
    expect(resolvePendingResourcesRoute(true)).toEqual({ path: '/inbox', query: { tab: 'all' } });
    expect(resolvePendingResourcesRoute(false)).toBe('/inbox');
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
