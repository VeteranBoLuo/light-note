import { describe, expect, it } from 'vitest';
import { summarizeBookmarkCoverage } from './bookmarkCoverage';

describe('书签标签覆盖统计', () => {
  it('兼容对象和 ID 两种关联形态，并按书签 ID 去重', () => {
    expect(
      summarizeBookmarkCoverage(
        [
          { bookmarkList: [{ id: 'bookmark-1' }, { id: 'bookmark-2' }] },
          { bookmarkList: ['bookmark-2', 'bookmark-3'] },
          { bookmarkList: [] },
        ],
        5,
      ),
    ).toEqual({
      total: 5,
      activeTagCount: 2,
      taggedBookmarkCount: 3,
      untaggedBookmarkCount: 2,
    });
  });

  it('忽略无效关联，并把异常总数收敛到安全范围', () => {
    expect(summarizeBookmarkCoverage([{ bookmarkList: [{ id: null }, { id: '' }] }], -3)).toEqual({
      total: 0,
      activeTagCount: 1,
      taggedBookmarkCount: 0,
      untaggedBookmarkCount: 0,
    });
  });
});
