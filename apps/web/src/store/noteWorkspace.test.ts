import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import useNoteWorkspaceStore, { NOTE_TREE_ROOT_KEY } from './noteWorkspace';
import type { NoteTreeItem } from '@/types/noteTree';

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
});
