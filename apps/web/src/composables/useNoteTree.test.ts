import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

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
    setActivePinia(createPinia());
    vi.clearAllMocks();
    sessionStorage.clear();
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
      if (url.endsWith('/queryNoteTree') && body.keyword) {
        return {
          status: 200,
          data: {
            parentId: body.parentId,
            keyword: body.keyword,
            matchCount: 1,
            items: [
              {
                id: 'project',
                parentId: null,
                title: '项目',
                childCount: 1,
                hasChildren: true,
                isTop: false,
                sort: 0,
                matched: false,
                children: [
                  {
                    id: 'module',
                    parentId: 'project',
                    title: '模块',
                    childCount: 1,
                    hasChildren: true,
                    isTop: false,
                    sort: 0,
                    matched: false,
                    children: [
                      {
                        id: 'deep-page',
                        parentId: 'module',
                        title: '深层页面',
                        childCount: 0,
                        hasChildren: false,
                        isTop: false,
                        sort: 0,
                        matched: true,
                      },
                    ],
                  },
                ],
              },
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

  it('切换目录时清除标签筛选，只保留目录分类范围', async () => {
    const scope = effectScope();
    const tree = scope.run(() => useNoteTree());

    await tree?.selectDirectory('project');
    expect(mocks.push).toHaveBeenLastCalledWith({
      path: '/noteLibrary',
      query: { parent: 'project' },
    });

    await tree?.selectDirectory(null);
    expect(mocks.push).toHaveBeenLastCalledWith({
      path: '/noteLibrary',
      query: {},
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

  it('展开节点只在当前浏览会话保存并限制为稳定 ID 列表', async () => {
    sessionStorage.setItem('light-note-note-tree-expanded-ids', JSON.stringify(['saved-node', '', 42]));
    const scope = effectScope();
    const tree = scope.run(() => useNoteTree());

    expect(tree?.expandedIds.value.has('saved-node')).toBe(true);
    await vi.waitFor(() => expect(tree?.expandedIds.value.has('project')).toBe(true));
    expect(JSON.parse(sessionStorage.getItem('light-note-note-tree-expanded-ids') || '[]')).toEqual(
      expect.arrayContaining(['saved-node', '42', 'project']),
    );
    scope.stop();
  });

  it('恢复会话中的展开状态时同步加载对应子层，避免只有展开箭头没有子页面', async () => {
    mocks.route.value = {
      query: {},
      fullPath: '/noteLibrary',
    };
    sessionStorage.setItem('light-note-note-tree-expanded-ids', JSON.stringify(['project']));
    const scope = effectScope();
    const tree = scope.run(() => useNoteTree());

    await vi.waitFor(() => {
      expect(tree?.childrenByParent.value[NOTE_TREE_ROOT_KEY]?.map((item) => item.id)).toEqual(['project']);
      expect(tree?.childrenByParent.value.project?.map((item) => item.id)).toEqual(['module']);
    });
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/note/queryNoteTree',
      { parentId: 'project', depth: 1 },
      { silent: true },
    );
    scope.stop();
  });

  it('读取灰度关闭时不请求树，开启后再加载当前 URL 路径', async () => {
    const enabled = ref(false);
    const scope = effectScope();
    const tree = scope.run(() => useNoteTree({ enabled }));

    await Promise.resolve();
    expect(mocks.apiBasePost).not.toHaveBeenCalled();
    enabled.value = true;
    await vi.waitFor(() => expect(tree?.currentBreadcrumb.value).toHaveLength(2));
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/note/queryNoteBreadcrumb',
      { noteId: 'module' },
      { silent: true },
    );
    scope.stop();
  });

  it('移动详情先取轻量面包屑，目录未打开前不拉根节点和祖先分支', async () => {
    mocks.route.value = {
      name: 'noteDetail',
      params: { id: 'module' },
      query: {},
      fullPath: '/noteLibrary/module',
    } as any;
    const loadTree = ref(false);
    const revealBreadcrumb = ref(false);
    const scope = effectScope();
    const tree = scope.run(() => useNoteTree({ loadTree, revealBreadcrumb }));

    await vi.waitFor(() => expect(tree?.currentBreadcrumb.value).toHaveLength(2));
    expect(mocks.apiBasePost).toHaveBeenCalledTimes(1);
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/note/queryNoteBreadcrumb',
      { noteId: 'module' },
      { silent: true },
    );

    loadTree.value = true;
    revealBreadcrumb.value = true;
    await vi.waitFor(() => expect(tree?.childrenByParent.value[NOTE_TREE_ROOT_KEY]).toHaveLength(1));
    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/note/queryNoteTree',
      { parentId: null, depth: 1 },
      { silent: true },
    );
    scope.stop();
  });

  it('目录搜索使用服务端命中与祖先树，并自动展开完整路径', async () => {
    const scope = effectScope();
    const tree = scope.run(() => useNoteTree());

    await tree?.searchTree('深层页面', 'project');

    expect(mocks.apiBasePost).toHaveBeenCalledWith(
      '/api/note/queryNoteTree',
      { parentId: null, depth: 'all', keyword: '深层页面' },
      { silent: true },
    );
    expect(tree?.treeSearchMatchCount.value).toBe(1);
    expect(tree?.treeSearchChildrenByParent.value[NOTE_TREE_ROOT_KEY]?.map((item) => item.id)).toEqual(['project']);
    expect(tree?.treeSearchChildrenByParent.value.project?.map((item) => item.id)).toEqual(['module']);
    expect(tree?.treeSearchChildrenByParent.value.module?.map((item) => item.id)).toEqual(['deep-page']);
    expect(tree?.treeSearchExpandedIds.value).toEqual(new Set(['project', 'module']));
    expect(tree?.treeSearchChildrenByParent.value.module?.[0]?.matched).toBe(true);
    scope.stop();
  });
});
