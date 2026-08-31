import { describe, expect, it } from 'vitest';
import { mergeToolboxNoteBranchSelection, removeToolboxSelectedResource } from './toolboxResourceSelection';

const scope = { type: 'note_branch' as const, id: 'parent', title: '开发文档' };
const descendants = [
  { id: 'child', title: '接口约定' },
  { id: 'grandchild', title: '错误码' },
];

describe('toolbox resource branch selection', () => {
  it('把父笔记与多级后代展开成去重后的普通笔记引用', () => {
    const result = mergeToolboxNoteBranchSelection({
      current: [{ type: 'bookmark', id: 'bookmark-1', title: '参考链接' }],
      scope,
      descendants,
      max: 10,
    });
    expect(result.status).toBe('merged');
    if (result.status !== 'merged') return;
    expect(result.items.map(({ type, id }) => `${type}:${id}`)).toEqual([
      'bookmark:bookmark-1',
      'note:parent',
      'note:child',
      'note:grandchild',
    ]);
    expect(result.items.slice(1).every((item) => item.selectionGroup?.id === 'parent')).toBe(true);
  });

  it('已有单篇会被合并进目录分组而不会重复计数', () => {
    const result = mergeToolboxNoteBranchSelection({
      current: [
        { type: 'note', id: 'parent', title: '开发文档' },
        { type: 'note', id: 'child', title: '接口约定' },
      ],
      scope,
      descendants,
      max: 3,
    });
    expect(result.status).toBe('merged');
    if (result.status !== 'merged') return;
    expect(result.items).toHaveLength(3);
    expect(result.items.every((item) => item.selectionGroup?.id === 'parent')).toBe(true);
  });

  it('完整目录超过工具上限时整体拒绝，不做静默截断', () => {
    expect(mergeToolboxNoteBranchSelection({ current: [], scope, descendants, max: 2 })).toMatchObject({
      status: 'limit_exceeded',
      branchCount: 3,
      totalCount: 3,
    });
  });

  it('从完整目录取消一篇后清除其余项的完整目录标记', () => {
    const merged = mergeToolboxNoteBranchSelection({ current: [], scope, descendants, max: 3 });
    if (merged.status !== 'merged') throw new Error('expected merged branch');
    const next = removeToolboxSelectedResource(merged.items, { type: 'note', id: 'child', title: '接口约定' });
    expect(next.map((item) => item.id)).toEqual(['parent', 'grandchild']);
    expect(next.every((item) => item.selectionGroup == null)).toBe(true);
  });
});
