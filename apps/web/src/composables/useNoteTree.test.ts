import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';

const mocks = vi.hoisted(() => ({
  route: {
    value: {
      query: { parent: 'module', tag: 'tag-1' } as Record<string, string>,
      fullPath: '/noteLibrary?parent=module&tag=tag-1',
    },
  },
  push: vi.fn(),
  apiBasePost: vi.fn(),
}));

vi.mock('@/router', () => ({
  default: {
    currentRoute: mocks.route,
    push: mocks.push,
  },
}));

vi.mock('@/http/request', () => ({ apiBasePost: mocks.apiBasePost }));

const { NOTE_TREE_ROOT_KEY, useNoteTree } = await import('./useNoteTree');

describe('useNoteTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.route.value = {
      query: { parent: 'module', tag: 'tag-1' },
      fullPath: '/noteLibrary?parent=module&tag=tag-1',
    };
    mocks.push.mockResolvedValue(undefined);
    mocks.apiBasePost.mockImplementation(async (url: string, body: any) => {
      if (url.endsWith('/queryNoteBreadcrumb')) {
        return {
          status: 200,
          data: {
            items: [
              { id: 'project', title: '项目' },
              { id: 'module', title: '模块' },
            ],
          },
        };
      }
      if (url.endsWith('/queryNoteTree') && body.parentId === null) {
        return {
          status: 200,
          data: {
            parentId: null,
            items: [
              {
                id: 'project',
                parentId: null,
                title: '项目',
                childCount: 1,
                hasChildren: true,
                isTop: false,
                sort: 0,
              },
            ],
          },
        };
      }
      return {
        status: 200,
        data: {
          parentId: body.parentId,
          items: [
            {
              id: 'module',
              parentId: 'project',
              title: '模块',
              childCount: 0,
              hasChildren: false,
              isTop: false,
              sort: 0,
            },
          ],
        },
      };
    });
  });

  it('按 URL parent 加载面包屑、展开祖先，并缓存已加载层级', async () => {
    const scope = effectScope();
    const tree = scope.run(() => useNoteTree());
    expect(tree).toBeTruthy();

    await vi.waitFor(() => {
      expect(tree?.currentBreadcrumb.value).toHaveLength(2);
      expect(tree?.childrenByParent.value[NOTE_TREE_ROOT_KEY]).toHaveLength(1);
      expect(tree?.childrenByParent.value.project).toHaveLength(1);
    });
    expect(tree?.expandedIds.value.has('project')).toBe(true);

    const callsBefore = mocks.apiBasePost.mock.calls.length;
    await tree?.loadChildren('project');
    expect(mocks.apiBasePost).toHaveBeenCalledTimes(callsBefore);
    scope.stop();
  });

  it('切换目录时保留标签筛选，只改写 parent', async () => {
    const scope = effectScope();
    const tree = scope.run(() => useNoteTree());

    await tree?.selectDirectory('project');
    expect(mocks.push).toHaveBeenLastCalledWith({
      path: '/noteLibrary',
      query: { parent: 'project', tag: 'tag-1' },
    });

    await tree?.selectDirectory(null);
    expect(mocks.push).toHaveBeenLastCalledWith({
      path: '/noteLibrary',
      query: { tag: 'tag-1' },
    });
    scope.stop();
  });

  it('打开正文时记录当前目录 URL，供详情页稳定返回', async () => {
    const scope = effectScope();
    const tree = scope.run(() => useNoteTree());

    await tree?.openDirectoryPage('module');
    expect(mocks.push).toHaveBeenCalledWith({
      path: '/noteLibrary/module',
      query: { from: '/noteLibrary?parent=module&tag=tag-1' },
    });
    scope.stop();
  });
});
