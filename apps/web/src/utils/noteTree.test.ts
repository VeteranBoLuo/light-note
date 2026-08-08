import { describe, expect, it } from 'vitest';
import {
  canMoveNoteSubtreeToDepth,
  collectNoteDescendantIds,
  flattenNoteTree,
  getNoteParentPathText,
  getNoteParentTargetId,
} from './noteTree';

const tree = [
  {
    id: 'root',
    parentId: null,
    title: '根',
    childCount: 1,
    hasChildren: true,
    isTop: false,
    sort: 0,
    children: [
      {
        id: 'child',
        parentId: 'root',
        title: '子',
        childCount: 1,
        hasChildren: true,
        isTop: false,
        sort: 0,
        children: [
          {
            id: 'grandchild',
            parentId: 'child',
            title: '孙',
            childCount: 0,
            hasChildren: false,
            isTop: false,
            sort: 0,
          },
        ],
      },
    ],
  },
];

describe('noteTree 前端纯函数', () => {
  it('按展示顺序展平并保留层级', () => {
    expect(flattenNoteTree(tree).map(({ id, depth }) => ({ id, depth }))).toEqual([
      { id: 'root', depth: 1 },
      { id: 'child', depth: 2 },
      { id: 'grandchild', depth: 3 },
    ]);
  });

  it('收集指定页面的全部后代但不包含页面自身', () => {
    expect(collectNoteDescendantIds(tree, 'root')).toEqual(new Set(['child', 'grandchild']));
    expect(collectNoteDescendantIds(tree, 'grandchild')).toEqual(new Set());
  });

  it('移动前按目标父层级和子树相对深度阻止超过 8 层', () => {
    expect(canMoveNoteSubtreeToDepth(6, 1, 8)).toBe(true);
    expect(canMoveNoteSubtreeToDepth(7, 1, 8)).toBe(false);
    expect(canMoveNoteSubtreeToDepth(0, 7, 8)).toBe(true);
    expect(canMoveNoteSubtreeToDepth(0, 0, 0)).toBe(false);
  });

  it('卡片路径只显示父目录，不重复当前笔记标题，并兼容旧响应', () => {
    expect(
      getNoteParentPathText({
        title: '复盘',
        path: [{ title: '项目' }, { title: '模块' }, { title: '复盘' }],
      }),
    ).toBe('项目 / 模块');
    expect(getNoteParentPathText({ title: '椅子', pathText: '椅子' })).toBe('');
    expect(getNoteParentPathText({ title: '复盘', pathText: '项目 / 模块 / 复盘' })).toBe('项目 / 模块');
  });

  it('父级入口始终取直接父页面 ID，不按标题猜测目标', () => {
    expect(
      getNoteParentTargetId({
        parentId: 'legacy-parent',
        path: [
          { id: 'root', title: '项目' },
          { id: 'direct-parent', title: '模块' },
          { id: 'current', title: '复盘' },
        ],
      }),
    ).toBe('direct-parent');
    expect(getNoteParentTargetId({ parentId: 'legacy-parent' })).toBe('legacy-parent');
    expect(getNoteParentTargetId({ path: [{ id: 'current', title: '根页面' }] })).toBe('');
  });
});
