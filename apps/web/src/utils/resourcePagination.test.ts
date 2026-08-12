import { describe, expect, it } from 'vitest';
import {
  buildResourceSortMove,
  hasResourceOrderChanged,
  isNearResourceScrollEnd,
  mergeResourcePage,
  mergeResourceRefreshedHead,
} from './resourcePagination';

describe('resource pagination helpers', () => {
  it('merges pages without duplicating resources', () => {
    expect(
      mergeResourcePage(
        [
          { id: '1', title: 'old' },
          { id: '2', title: 'two' },
        ],
        [
          { id: '2', title: 'new' },
          { id: '3', title: 'three' },
        ],
      ),
    ).toEqual([
      { id: '1', title: 'old' },
      { id: '2', title: 'new' },
      { id: '3', title: 'three' },
    ]);
  });

  it('detects a scroll position close enough to request the next page', () => {
    expect(isNearResourceScrollEnd({ scrollTop: 500, clientHeight: 400, scrollHeight: 1200 })).toBe(true);
    expect(isNearResourceScrollEnd({ scrollTop: 100, clientHeight: 400, scrollHeight: 1200 })).toBe(false);
  });

  it('刷新第一页时保留已加载尾页并去掉跨页重复项', () => {
    expect(
      mergeResourceRefreshedHead(
        [
          { id: '1', title: 'old-1' },
          { id: '2', title: 'old-2' },
          { id: '3', title: 'old-3' },
          { id: '4', title: 'old-4' },
        ],
        [
          { id: '3', title: 'new-3' },
          { id: '1', title: 'new-1' },
        ],
      ),
    ).toEqual([
      { id: '3', title: 'new-3' },
      { id: '1', title: 'new-1' },
      { id: '2', title: 'old-2' },
      { id: '4', title: 'old-4' },
    ]);
  });

  it('builds adjacent sort anchors without depending on an unloaded tail', () => {
    const items = [
      { id: 'pinned', isTop: true },
      { id: 'b', isTop: false },
      { id: 'a', isTop: false },
      { id: 'c', isTop: false },
    ];
    const move = buildResourceSortMove(
      items,
      'a',
      (candidate, moved) => Boolean(candidate.isTop) === Boolean(moved.isTop),
    );

    expect(move).toEqual({ id: 'a', previousId: 'b', nextId: 'c' });
    expect(hasResourceOrderChanged(items, [...items])).toBe(false);
    expect(hasResourceOrderChanged(items, [items[0], items[2], items[1], items[3]])).toBe(true);
  });
});
