import { describe, expect, it } from 'vitest';
import {
  buildRootStartDropTarget,
  buildTreeNodeDropTarget,
  moveNoteTreeNodeOptimistically,
  normalizePinnedAfterDropTarget,
} from './noteTreeDrop';

const source = { id: 'moving', isTop: false };
const target = { id: 'target', parentId: 'parent', title: '目标页面', isTop: false };

describe('笔记页面树拖拽落点', () => {
  it('节点上沿和下沿生成同级前后锚点，中央生成子页面落点', () => {
    expect(buildTreeNodeDropTarget({ node: target, source, relativeY: 2, height: 40 })).toMatchObject({
      parentId: 'parent',
      previousId: null,
      nextId: 'target',
      position: 'before',
    });
    expect(buildTreeNodeDropTarget({ node: target, source, relativeY: 38, height: 40 })).toMatchObject({
      parentId: 'parent',
      previousId: 'target',
      nextId: null,
      position: 'after',
    });
    expect(buildTreeNodeDropTarget({ node: target, source, relativeY: 20, height: 40 })).toMatchObject({
      parentId: 'target',
      previousId: null,
      nextId: null,
      position: 'inside',
    });
  });

  it('跨置顶分组仍可使用边缘落点，由服务端跟随目标分组切换置顶状态', () => {
    const pinnedTarget = { ...target, isTop: true };
    expect(buildTreeNodeDropTarget({ node: pinnedTarget, source, relativeY: 2, height: 40 })).toMatchObject({
      isTop: true,
      parentId: 'parent',
      previousId: null,
      nextId: 'target',
      position: 'before',
    });
    expect(buildTreeNodeDropTarget({ node: pinnedTarget, source, relativeY: 38, height: 40 })).toMatchObject({
      parentId: 'parent',
      previousId: 'target',
      nextId: null,
      position: 'after',
    });
    expect(buildTreeNodeDropTarget({ node: pinnedTarget, source, relativeY: 20, height: 40 })).toMatchObject({
      isTop: false,
      parentId: 'target',
      position: 'inside',
    });
  });

  it('普通页面只有拖到置顶页面前方才置顶，拖到后方进入普通组最前', () => {
    const pinnedTarget = { ...target, isTop: true };
    const before = buildTreeNodeDropTarget({ node: pinnedTarget, source, relativeY: 2, height: 40 });
    const after = buildTreeNodeDropTarget({ node: pinnedTarget, source, relativeY: 38, height: 40 });

    expect(before).toMatchObject({ position: 'before', isTop: true, nextId: 'target' });
    expect(
      normalizePinnedAfterDropTarget({
        target: after!,
        source,
        siblings: [
          { id: 'target', isTop: true },
          { id: 'another-pinned', isTop: true },
          { id: 'first-normal', isTop: false },
        ],
      }),
    ).toMatchObject({ position: 'after', isTop: false, previousId: null, nextId: 'first-normal' });
  });

  it('把子目录拖到父目录边缘时提升为父目录的同级节点，而不是建立额外关联', () => {
    const parentNode = {
      id: 'parent',
      parentId: 'grandparent',
      title: '原父目录',
      isTop: false,
    };
    expect(buildTreeNodeDropTarget({ node: parentNode, source, relativeY: 39, height: 40 })).toMatchObject({
      parentId: 'grandparent',
      previousId: 'parent',
      nextId: null,
      position: 'after',
    });
  });

  it('根目录落点插到同置顶分组最前，已经位于最前时视为无效落点', () => {
    const rootItems = [
      { id: 'pinned', isTop: true },
      { id: 'first', isTop: false },
      { id: 'moving', isTop: false },
    ];
    expect(buildRootStartDropTarget({ rootItems, source, title: '笔记库', rootKey: 'root' })).toMatchObject({
      parentId: null,
      previousId: null,
      nextId: 'first',
      position: 'root-start',
    });
    expect(
      buildRootStartDropTarget({
        rootItems,
        source: { id: 'first', isTop: false },
        title: '笔记库',
        rootKey: 'root',
      }),
    ).toBeNull();
  });

  it('置顶页面从子目录移回无置顶节点的根层时，落点明确表示取消置顶', () => {
    expect(
      buildRootStartDropTarget({
        rootItems: [{ id: 'normal', isTop: false }],
        source: { id: 'moving', isTop: true, parentId: 'old-parent' },
        title: '笔记库',
        rootKey: 'root',
      }),
    ).toMatchObject({ isTop: false, parentId: null, previousId: null, nextId: null });
  });

  it('接口确认前立即交换同层节点位置，且不修改用于失败回滚的旧树', () => {
    const tree = {
      __light_note_root__: [
        { id: 'a', parentId: null, title: 'A', childCount: 0, hasChildren: false, isTop: false, sort: 0 },
        { id: 'moving', parentId: null, title: '移动项', childCount: 0, hasChildren: false, isTop: false, sort: 1 },
        { id: 'b', parentId: null, title: 'B', childCount: 0, hasChildren: false, isTop: false, sort: 2 },
      ],
    };
    const result = moveNoteTreeNodeOptimistically(tree, 'moving', {
      key: 'b',
      isTop: false,
      parentId: null,
      title: 'B',
      previousId: 'b',
      nextId: null,
      position: 'after',
    });

    expect(result.applied).toBe(true);
    expect(result.childrenByParent.__light_note_root__.map((item) => item.id)).toEqual(['a', 'b', 'moving']);
    expect(tree.__light_note_root__.map((item) => item.id)).toEqual(['a', 'moving', 'b']);
  });

  it('移入其他目录时即时更新父级、置顶状态与两侧子页面数量', () => {
    const tree = {
      __light_note_root__: [
        { id: 'old', parentId: null, title: '旧目录', childCount: 1, hasChildren: true, isTop: false, sort: 0 },
        { id: 'new', parentId: null, title: '新目录', childCount: 1, hasChildren: true, isTop: false, sort: 1 },
      ],
      old: [
        { id: 'moving', parentId: 'old', title: '移动项', childCount: 0, hasChildren: false, isTop: true, sort: 0 },
      ],
      new: [
        { id: 'child', parentId: 'new', title: '原子页', childCount: 0, hasChildren: false, isTop: false, sort: 0 },
      ],
    };
    const result = moveNoteTreeNodeOptimistically(tree, 'moving', {
      key: 'new',
      isTop: false,
      parentId: 'new',
      title: '新目录',
      previousId: null,
      nextId: null,
      position: 'inside',
    });

    expect(result.childrenByParent.old).toEqual([]);
    expect(result.childrenByParent.new.map((item) => item.id)).toEqual(['child', 'moving']);
    expect(result.childrenByParent.new[1]).toMatchObject({ parentId: 'new', isTop: false, sort: 1 });
    expect(result.childrenByParent.__light_note_root__).toEqual([
      expect.objectContaining({ id: 'old', childCount: 0, hasChildren: false }),
      expect.objectContaining({ id: 'new', childCount: 2, hasChildren: true }),
    ]);
  });
});
