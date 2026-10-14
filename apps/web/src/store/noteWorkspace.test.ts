import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import useNoteWorkspaceStore, { NOTE_TREE_ROOT_KEY } from './noteWorkspace';
import type { NoteTreeItem } from '@/types/noteTree';

const mocks = vi.hoisted(() => ({ apiBasePost: vi.fn() }));
vi.mock('@/http/request', () => ({ apiBasePost: mocks.apiBasePost }));

const treeNode = (overrides: Partial<NoteTreeItem> = {}): NoteTreeItem => ({
  id: 'note-1',
  parentId: null,
  title: '原标题',
  type: 'html',
  childCount: 0,
  hasChildren: false,
  isTop: false,
  sort: 10,
  ...overrides,
});

describe('noteWorkspace 目录元数据同步', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    setActivePinia(createPinia());
    mocks.apiBasePost.mockReset();
  });

  it('详情目录滚动位置仅保存在当前账号工作区，切换账号后归零', () => {
    const workspace = useNoteWorkspaceStore();
    workspace.ensureOwner('user-a');
    workspace.setDetailTreeScrollTop(386.5);
    expect(workspace.detailTreeScrollTop).toBe(386.5);

    workspace.setDetailTreeScrollTop(Number.NaN);
    expect(workspace.detailTreeScrollTop).toBe(0);
    workspace.setDetailTreeScrollTop(240);
    workspace.ensureOwner('user-b');
    expect(workspace.detailTreeScrollTop).toBe(0);
  });

  it.each(['success', 'failure'] as const)(
    '导入刷新作废旧根层和子层请求，迟到 %s 不覆盖新顺序或错误状态',
    async (outcome) => {
      const workspace = useNoteWorkspaceStore();
      const parent = treeNode({ id: 'parent', childCount: 2, hasChildren: true });
      workspace.childrenByParent = { [NOTE_TREE_ROOT_KEY]: [parent], parent: [treeNode({ id: 'old' })] };
      workspace.expandedIds = new Set(['parent']);
      const deferred: { resolve: (v: any) => void; reject: (e: Error) => void }[] = [];
      mocks.apiBasePost
        .mockImplementationOnce(() => new Promise((resolve, reject) => deferred.push({ resolve, reject })))
        .mockImplementationOnce(() => new Promise((resolve, reject) => deferred.push({ resolve, reject })));
      const oldRoot = workspace.loadChildren(null, true);
      const oldChild = workspace.loadChildren('parent', true);
      mocks.apiBasePost.mockImplementation(async (_url, body) => ({
        status: 200,
        data: {
          items: body.parentId ? [treeNode({ id: 'imported', sort: 0 }), treeNode({ id: 'old', sort: 1 })] : [parent],
        },
      }));
      const refresh = workspace.refreshTree();
      expect(workspace.childrenByParent).toEqual({});
      await refresh;
      expect(mocks.apiBasePost).toHaveBeenCalledTimes(4);
      for (const request of deferred) {
        if (outcome === 'success') request.resolve({ status: 200, data: { items: [] } });
        else request.reject(new Error('old request failed'));
      }
      await Promise.all([oldRoot, oldChild]);
      expect(workspace.childrenByParent.parent.map((node) => node.id)).toEqual(['imported', 'old']);
      expect(workspace.childrenByParent[NOTE_TREE_ROOT_KEY][0].id).toBe('parent');
      expect(workspace.treeError).toBe('');
      expect(workspace.loadingKeys.size).toBe(0);
    },
  );

  it('连续导入刷新以最后一批响应为准；刷新失败允许重新读取', async () => {
    const workspace = useNoteWorkspaceStore();
    workspace.childrenByParent = { [NOTE_TREE_ROOT_KEY]: [treeNode({ id: 'old' })] };
    let finishFirst!: (v: any) => void;
    mocks.apiBasePost.mockReturnValueOnce(
      new Promise((resolve) => {
        finishFirst = resolve;
      }),
    );
    const first = workspace.refreshTree();
    mocks.apiBasePost.mockResolvedValueOnce({ status: 200, data: { items: [treeNode({ id: 'latest' })] } });
    await workspace.refreshTree();
    finishFirst({ status: 200, data: { items: [treeNode({ id: 'obsolete' })] } });
    await first;
    expect(workspace.childrenByParent[NOTE_TREE_ROOT_KEY][0].id).toBe('latest');
    mocks.apiBasePost.mockRejectedValueOnce(new Error('offline'));
    await workspace.refreshTree();
    expect(workspace.childrenByParent).toEqual({});
    expect(workspace.treeError).toBe('offline');
    expect(workspace.loadedKeys.has(NOTE_TREE_ROOT_KEY)).toBe(false);
    mocks.apiBasePost.mockResolvedValueOnce({ status: 200, data: { items: [treeNode({ id: 'recovered' })] } });
    await workspace.loadChildren();
    expect(workspace.childrenByParent[NOTE_TREE_ROOT_KEY][0].id).toBe('recovered');
  });

  it('刷新确认最后一个子页已删除时，清除展开分支的旧快照', async () => {
    const workspace = useNoteWorkspaceStore();
    workspace.childrenByParent = {
      [NOTE_TREE_ROOT_KEY]: [treeNode({ id: 'parent', childCount: 1, hasChildren: true })],
      parent: [treeNode({ id: 'deleted', parentId: 'parent' })],
    };
    workspace.expandedIds = new Set(['parent']);
    mocks.apiBasePost.mockResolvedValueOnce({
      status: 200,
      data: { items: [treeNode({ id: 'parent', childCount: 0, hasChildren: false })] },
    });
    await workspace.refreshTree();
    expect(workspace.childrenByParent[NOTE_TREE_ROOT_KEY][0].hasChildren).toBe(false);
    expect(workspace.childrenByParent.parent).toBeUndefined();
    expect(mocks.apiBasePost).toHaveBeenCalledTimes(1);
  });

  it('显式进入笔记库根页会生成独立请求令牌，旧请求结束不能覆盖较新的导航', () => {
    const workspace = useNoteWorkspaceStore();

    const firstToken = workspace.beginLibraryRootEntryRequest();
    const secondToken = workspace.beginLibraryRootEntryRequest();

    expect(secondToken).toBeGreaterThan(firstToken);
    expect(workspace.libraryRootEntryRequestToken).toBe(secondToken);

    workspace.finishLibraryRootEntryRequest(firstToken);
    expect(workspace.libraryRootEntryRequestToken).toBe(secondToken);

    workspace.finishLibraryRootEntryRequest(secondToken);
    expect(workspace.libraryRootEntryRequestToken).toBeNull();
  });

  it('根页重置统一清除浏览选择和目录搜索，但保留目录展开偏好', () => {
    const workspace = useNoteWorkspaceStore();
    workspace.ensureOwner('user-a');
    workspace.setNavigation({ activePageId: 'leaf-note', browseParentId: 'parent-note' });
    workspace.detailTab = 'outline';
    workspace.currentBreadcrumb = [{ id: 'parent-note', title: '父页面' }];
    workspace.treeSearchKeyword = '关键词';
    workspace.treeSearchMatchCount = 2;
    workspace.treeSearchExpandedIds = new Set(['parent-note']);
    workspace.expandedIds = new Set(['kept-parent']);

    workspace.resetLibraryRootState();

    expect(workspace.detailTab).toBe('pages');
    expect(workspace.activePageId).toBeNull();
    expect(workspace.browseParentId).toBeNull();
    expect(workspace.currentBreadcrumb).toEqual([]);
    expect(workspace.treeSearchKeyword).toBe('');
    expect(workspace.treeSearchMatchCount).toBe(0);
    expect(workspace.treeSearchExpandedIds).toEqual(new Set());
    expect(workspace.expandedIds).toEqual(new Set(['kept-parent']));
    expect(sessionStorage.getItem('light-note-note-library-preview')).toBeNull();
  });

  it('保存标题与格式后同步普通树、搜索树和所有已缓存面包屑', () => {
    const workspace = useNoteWorkspaceStore();
    workspace.childrenByParent = { [NOTE_TREE_ROOT_KEY]: [treeNode()] };
    workspace.treeSearchChildrenByParent = {
      [NOTE_TREE_ROOT_KEY]: [
        treeNode({
          id: 'parent',
          children: [treeNode({ parentId: 'parent' })],
        }),
      ],
    };
    workspace.breadcrumbByNote = {
      'note-1': [{ id: 'note-1', title: '原标题' }],
      descendant: [
        { id: 'note-1', title: '原标题' },
        { id: 'descendant', title: '子页面' },
      ],
    };
    workspace.currentBreadcrumb = workspace.breadcrumbByNote.descendant;

    workspace.updateNoteMetadata('note-1', {
      title: 'markdown 编辑预览匹配优化',
      type: 'markdown',
      hasContent: false,
    });

    expect(workspace.childrenByParent[NOTE_TREE_ROOT_KEY][0]).toMatchObject({
      title: 'markdown 编辑预览匹配优化',
      type: 'markdown',
      hasContent: false,
    });
    expect(workspace.treeSearchChildrenByParent[NOTE_TREE_ROOT_KEY][0].children?.[0]).toMatchObject({
      title: 'markdown 编辑预览匹配优化',
      type: 'markdown',
      hasContent: false,
    });
    expect(workspace.breadcrumbByNote['note-1'][0].title).toBe('markdown 编辑预览匹配优化');
    expect(workspace.breadcrumbByNote.descendant[0].title).toBe('markdown 编辑预览匹配优化');
    expect(workspace.currentBreadcrumb[0].title).toBe('markdown 编辑预览匹配优化');
  });

  it('首次保存后立即把新文档插入已缓存目录，并幂等更新父节点计数', () => {
    mocks.apiBasePost.mockResolvedValue({
      status: 200,
      data: { items: [treeNode({ id: 'created-note', parentId: 'parent' })] },
    });
    const workspace = useNoteWorkspaceStore();
    workspace.childrenByParent = {
      [NOTE_TREE_ROOT_KEY]: [treeNode({ id: 'parent', title: '父页面', childCount: 0, hasChildren: false })],
      parent: [],
    };

    const created = {
      id: 'created-note',
      parentId: 'parent',
      title: '刚刚保存的文档',
      type: 'markdown',
    };
    workspace.insertCreatedNote(created);

    expect(workspace.childrenByParent.parent).toEqual([
      expect.objectContaining({
        id: 'created-note',
        parentId: 'parent',
        title: '刚刚保存的文档',
        type: 'markdown',
        hasChildren: false,
      }),
    ]);
    expect(workspace.childrenByParent[NOTE_TREE_ROOT_KEY][0]).toMatchObject({
      childCount: 1,
      hasChildren: true,
    });

    workspace.insertCreatedNote(created);
    expect(workspace.childrenByParent.parent).toHaveLength(1);
    expect(workspace.childrenByParent[NOTE_TREE_ROOT_KEY][0].childCount).toBe(1);
  });

  it.each([
    ['top', null],
    ['bottom', null],
    ['top', 'parent'],
    ['bottom', 'parent'],
  ] as const)('首次保存按 %s 即时插入 %s，并回读该父层保留置顶和旧节点相对顺序', async (position, parentId) => {
    const workspace = useNoteWorkspaceStore();
    const key = parentId || NOTE_TREE_ROOT_KEY;
    const old = [treeNode({ id: 'pin', isTop: true }), treeNode({ id: 'a', sort: 0 }), treeNode({ id: 'b', sort: 1 })];
    workspace.childrenByParent = { [key]: old, unrelated: [treeNode({ id: 'untouched' })] };
    workspace.loadedKeys = new Set([key, 'unrelated']);
    let resolve!: (value: any) => void;
    mocks.apiBasePost.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    workspace.insertCreatedNote({ id: 'created', parentId, title: '新笔记', type: 'html' }, position);
    const expected = position === 'top' ? ['pin', 'created', 'a', 'b'] : ['pin', 'a', 'b', 'created'];
    expect(workspace.childrenByParent[key].map((item) => item.id)).toEqual(expected);
    expect(workspace.childrenByParent[key].filter((item) => item.id !== 'created')).toEqual(old);
    expect(mocks.apiBasePost).toHaveBeenCalledExactlyOnceWith(
      '/api/note/queryNoteTree',
      { parentId, depth: 1 },
      { silent: true },
    );
    const refresh = workspace.loadChildren(parentId);
    const authoritative = expected.map((id, index) =>
      treeNode({ id, parentId, isTop: id === 'pin', sort: index + 20 }),
    );
    resolve({ status: 200, data: { items: authoritative } });
    await refresh;
    expect(workspace.childrenByParent[key]).toEqual(authoritative);
    expect(workspace.childrenByParent.unrelated[0].id).toBe('untouched');
    expect(workspace.loadedKeys.has(key)).toBe(true);
  });

  it('创建前目录请求迟到不会抹掉新节点，也不覆盖创建后的权威顺序', async () => {
    const workspace = useNoteWorkspaceStore();
    let oldResolve!: (value: any) => void;
    mocks.apiBasePost.mockReturnValueOnce(
      new Promise((done) => {
        oldResolve = done;
      }),
    );
    const oldRead = workspace.loadChildren();
    mocks.apiBasePost.mockResolvedValueOnce({
      status: 200,
      data: { items: [treeNode({ id: 'created', sort: 0 }), treeNode({ id: 'old', sort: 1 })] },
    });
    workspace.insertCreatedNote({ id: 'created', parentId: null, title: '新笔记', type: 'html' }, 'top');
    await workspace.loadChildren();
    oldResolve({ status: 200, data: { items: [treeNode({ id: 'old' })] } });
    await oldRead;
    expect(workspace.childrenByParent[NOTE_TREE_ROOT_KEY].map((item) => item.id)).toEqual(['created', 'old']);
  });

  it('回读失败保留新节点并允许重试，换账号后不应用前一账号的回读', async () => {
    const workspace = useNoteWorkspaceStore();
    workspace.ensureOwner('first');
    mocks.apiBasePost.mockRejectedValueOnce(new Error('offline'));
    workspace.insertCreatedNote({ id: 'created', parentId: null, title: '新笔记', type: 'html' }, 'top');
    await workspace.loadChildren();
    expect(workspace.childrenByParent[NOTE_TREE_ROOT_KEY][0].id).toBe('created');
    expect(workspace.loadedKeys.has(NOTE_TREE_ROOT_KEY)).toBe(false);
    let resolve!: (value: any) => void;
    mocks.apiBasePost.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const retry = workspace.loadChildren();
    workspace.ensureOwner('second');
    resolve({ status: 200, data: { items: [treeNode({ id: 'created' })] } });
    await retry;
    expect(workspace.childrenByParent).toEqual({});
    expect(workspace.treeError).toBe('');
  });

  it('移动页面后只失效包含该分支的面包屑缓存', () => {
    const workspace = useNoteWorkspaceStore();
    workspace.breadcrumbByNote = {
      moved: [{ id: 'moved', title: '移动页面' }],
      descendant: [
        { id: 'moved', title: '移动页面' },
        { id: 'descendant', title: '后代页面' },
      ],
      unrelated: [{ id: 'unrelated', title: '无关页面' }],
    };
    workspace.currentBreadcrumb = workspace.breadcrumbByNote.descendant;

    workspace.invalidateBreadcrumbBranch('moved');

    expect(workspace.breadcrumbByNote).toEqual({
      unrelated: [{ id: 'unrelated', title: '无关页面' }],
    });
    expect(workspace.currentBreadcrumb).toEqual([]);
  });

  it('目录缓存始终按置顶、手动顺序、更新时间和稳定 ID 排序', () => {
    const workspace = useNoteWorkspaceStore();
    workspace.childrenByParent = {
      [NOTE_TREE_ROOT_KEY]: [
        treeNode({ id: 'updated-old', sort: 2, updateTime: '2026-08-09T08:00:00.000Z' }),
        treeNode({ id: 'manual-first', sort: 0, updateTime: '2026-08-01T08:00:00.000Z' }),
        treeNode({ id: 'pinned', isTop: true, sort: 99, updateTime: '2026-07-01T08:00:00.000Z' }),
        treeNode({ id: 'updated-new', sort: 2, updateTime: '2026-08-10T08:00:00.000Z' }),
      ],
    };

    workspace.updateNoteMetadata('updated-old', { updateTime: '2026-08-09T08:00:00.000Z' });

    expect(workspace.childrenByParent[NOTE_TREE_ROOT_KEY].map((item) => item.id)).toEqual([
      'pinned',
      'manual-first',
      'updated-new',
      'updated-old',
    ]);

    workspace.updateNoteMetadata('updated-old', { isTop: true, sort: 0 });
    expect(workspace.childrenByParent[NOTE_TREE_ROOT_KEY].map((item) => item.id)).toEqual([
      'updated-old',
      'pinned',
      'manual-first',
      'updated-new',
    ]);
  });

  it('同一目录的并发读取复用一个在途请求', async () => {
    let resolveRequest!: (value: any) => void;
    mocks.apiBasePost.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const workspace = useNoteWorkspaceStore();

    const first = workspace.loadChildren(null);
    const second = workspace.loadChildren(null);
    expect(mocks.apiBasePost).toHaveBeenCalledTimes(1);

    resolveRequest({ status: 200, data: { items: [treeNode()] } });
    await expect(Promise.all([first, second])).resolves.toEqual([[treeNode()], [treeNode()]]);
    expect(mocks.apiBasePost).toHaveBeenCalledTimes(1);
  });

  it('同一笔记的并发面包屑读取去重，且可只更新路径而不展开整棵目录', async () => {
    let resolveRequest!: (value: any) => void;
    mocks.apiBasePost.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const workspace = useNoteWorkspaceStore();
    const items = [{ id: 'note-1', title: '笔记' }];

    const first = workspace.loadBreadcrumb('note-1', { reveal: false });
    const second = workspace.loadBreadcrumb('note-1', { reveal: false });
    expect(mocks.apiBasePost).toHaveBeenCalledTimes(1);

    resolveRequest({ status: 200, data: { items } });
    await expect(Promise.all([first, second])).resolves.toEqual([items, items]);
    expect(workspace.currentBreadcrumb).toEqual(items);
    expect(mocks.apiBasePost).toHaveBeenCalledTimes(1);
  });

  it('预览复用详情内嵌路径展开祖先并写入展开缓存，不覆盖当前浏览面包屑', async () => {
    const workspace = useNoteWorkspaceStore();
    workspace.ensureOwner('user-a');
    workspace.currentBreadcrumb = [{ id: 'browse-parent', title: '当前浏览目录' }];
    const items = [
      { id: 'root-parent', title: '根父页面' },
      { id: 'nested-parent', title: '嵌套父页面' },
      { id: 'leaf-note', title: '叶子页面' },
    ];
    mocks.apiBasePost.mockImplementation(async (url: string, payload: { parentId?: string | null }) => {
      expect(url).toBe('/api/note/queryNoteTree');
      if (payload.parentId === null) {
        return {
          status: 200,
          data: {
            items: [treeNode({ id: 'root-parent', childCount: 1, hasChildren: true })],
          },
        };
      }
      if (payload.parentId === 'root-parent') {
        return {
          status: 200,
          data: {
            items: [treeNode({ id: 'nested-parent', parentId: 'root-parent', childCount: 1, hasChildren: true })],
          },
        };
      }
      return {
        status: 200,
        data: { items: [treeNode({ id: 'leaf-note', parentId: 'nested-parent' })] },
      };
    });

    await expect(workspace.revealNotePath('leaf-note', items)).resolves.toEqual(items);
    await nextTick();

    expect(workspace.breadcrumbByNote['leaf-note']).toEqual(items);
    expect(workspace.currentBreadcrumb).toEqual([{ id: 'browse-parent', title: '当前浏览目录' }]);
    expect(workspace.expandedIds).toEqual(new Set(['root-parent', 'nested-parent']));
    expect(JSON.parse(sessionStorage.getItem('light-note-note-tree-expanded-ids') || '[]')).toEqual([
      'root-parent',
      'nested-parent',
    ]);
    expect(mocks.apiBasePost).toHaveBeenCalledTimes(3);
    expect(mocks.apiBasePost).not.toHaveBeenCalledWith(
      '/api/note/queryNoteBreadcrumb',
      expect.anything(),
      expect.anything(),
    );
  });

  it('详情接口随正文返回的面包屑会直接写入缓存，后续读取不再发起网络请求', async () => {
    const workspace = useNoteWorkspaceStore();
    const items = [
      { id: 'parent', title: '父页面' },
      { id: 'note-1', title: '当前页面' },
    ];

    expect(workspace.seedBreadcrumb('note-1', items)).toEqual(items);
    await expect(workspace.loadBreadcrumb('note-1', { reveal: false })).resolves.toEqual(items);

    expect(workspace.currentBreadcrumb).toEqual(items);
    expect(mocks.apiBasePost).not.toHaveBeenCalled();
  });
});
