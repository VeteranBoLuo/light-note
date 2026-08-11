import { createPinia, setActivePinia } from 'pinia';
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

    workspace.updateNoteMetadata('note-1', { title: 'markdown 编辑预览匹配优化', type: 'markdown' });

    expect(workspace.childrenByParent[NOTE_TREE_ROOT_KEY][0]).toMatchObject({
      title: 'markdown 编辑预览匹配优化',
      type: 'markdown',
    });
    expect(workspace.treeSearchChildrenByParent[NOTE_TREE_ROOT_KEY][0].children?.[0]).toMatchObject({
      title: 'markdown 编辑预览匹配优化',
      type: 'markdown',
    });
    expect(workspace.breadcrumbByNote['note-1'][0].title).toBe('markdown 编辑预览匹配优化');
    expect(workspace.breadcrumbByNote.descendant[0].title).toBe('markdown 编辑预览匹配优化');
    expect(workspace.currentBreadcrumb[0].title).toBe('markdown 编辑预览匹配优化');
  });

  it('首次保存后立即把新文档插入已缓存目录，并幂等更新父节点计数', () => {
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
