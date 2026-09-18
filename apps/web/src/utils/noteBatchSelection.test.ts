import { describe, expect, it } from 'vitest';
import { collectNoteBatchCandidates } from './noteBatchSelection';
import type { NoteTreeItem } from '@/types/noteTree';

const node = (id: string): NoteTreeItem => ({ id, parentId: null, title: id, childCount: 0, hasChildren: false, isTop: false, sort: 0 });

describe('笔记全选范围', () => {
  it('包含列表外目录项与展开子项，去重后优先保留完整列表快照', () => {
    const list = [{ id: 'a', title: '完整标题', content: '正文' }, { id: 'list-only' }];
    const result = collectNoteBatchCandidates(list, {
      root: [node('a'), node('b')], a: [node('child')], b: [node('collapsed')],
    }, new Set(['a']), 'root');
    expect(result.map((x) => x.id)).toEqual(['a', 'child', 'b', 'list-only']);
    expect(result[0]).toEqual(list[0]);
  });
  it('右侧空列表仍能全选目录，移动端无目录时沿用列表范围', () => {
    expect(collectNoteBatchCandidates([], { root: [node('a')] }, new Set(), 'root').map((x) => x.id)).toEqual(['a']);
    expect(collectNoteBatchCandidates([{ id: 'a' }], {}, new Set(), 'root')).toEqual([{ id: 'a' }]);
  });
  it('切换目录搜索范围不混入旧分支缓存，循环数据不会无限递归', () => {
    const result = collectNoteBatchCandidates([], { root: [node('a')], a: [node('a')], stale: [node('old')] }, new Set(['a']), 'root');
    expect(result.map((x) => x.id)).toEqual(['a']);
  });
});
