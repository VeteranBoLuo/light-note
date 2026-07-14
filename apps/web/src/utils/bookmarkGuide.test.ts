import { describe, expect, it } from 'vitest';
import { shouldStartCreateBookmarkGuide, type BookmarkGuideEligibility } from './bookmarkGuide';

const eligibleState: BookmarkGuideEligibility = {
  isMobile: false,
  isBookmarkRoot: true,
  isAllView: true,
  isLoading: false,
  isAllLoaded: true,
  bookmarkTotal: 0,
  visibleBookmarkCount: 0,
  hasCompleted: false,
};

describe('shouldStartCreateBookmarkGuide', () => {
  it('仅在书签根页面的全量数据已确认为空时启动', () => {
    expect(shouldStartCreateBookmarkGuide(eligibleState)).toBe(true);
  });

  it.each([
    ['全量数据尚未加载', { isAllLoaded: false }],
    ['全量数据正在加载', { isLoading: true }],
    ['用户已有书签', { bookmarkTotal: 195, visibleBookmarkCount: 195 }],
    ['当前是标签空结果', { isBookmarkRoot: false, isAllView: false }],
    ['当前是移动端', { isMobile: true }],
    ['用户已完成引导', { hasCompleted: true }],
  ])('%s 时不启动', (_name, patch) => {
    expect(shouldStartCreateBookmarkGuide({ ...eligibleState, ...patch })).toBe(false);
  });
});
