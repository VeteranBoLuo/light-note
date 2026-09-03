import { describe, expect, it } from 'vitest';
import {
  resolvePendingResourcesRoute,
  resolveResourceRoute,
  resolveTodoResourceReturnPath,
} from './resourceNavigation';

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

  it('只为笔记附加来源地址，书签和文件保持原跳转契约', () => {
    const noteReturnPath = '/inbox?tab=todo';
    expect(resolveResourceRoute({ type: 'note', id: 'note-1' }, { noteReturnPath })).toEqual({
      path: '/noteLibrary/note-1',
      query: { from: noteReturnPath },
    });
    expect(resolveResourceRoute({ type: 'bookmark', id: 'bookmark-1' }, { noteReturnPath })).toEqual({
      path: '/manage/editBookmark/bookmark-1',
    });
    expect(resolveResourceRoute({ type: 'file', id: 'file-1' }, { noteReturnPath })).toEqual({
      path: '/cloudSpace',
      query: { fileId: 'file-1' },
    });
  });

  it('待办页回流地址会恢复原待办并定位刚打开的参考资料', () => {
    expect(
      resolveTodoResourceReturnPath('/inbox?tab=todo&status=pending', 'todo-1', {
        type: 'note',
        id: 'note-1',
      }),
    ).toBe('/inbox?tab=todo&status=pending&todoId=todo-1&focusRef=note%3Anote-1');
  });

  it('非待办页与缺少待办标识时不改写来源地址', () => {
    expect(resolveTodoResourceReturnPath('/workbenches?view=today', 'todo-1')).toBe('/workbenches?view=today');
    expect(resolveTodoResourceReturnPath('/inbox?tab=todo', '')).toBe('/inbox?tab=todo');
  });
});
