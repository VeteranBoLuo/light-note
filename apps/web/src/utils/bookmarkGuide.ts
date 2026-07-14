export interface BookmarkGuideEligibility {
  isMobile: boolean;
  isBookmarkRoot: boolean;
  isAllView: boolean;
  isLoading: boolean;
  isAllLoaded: boolean;
  bookmarkTotal: number;
  visibleBookmarkCount: number;
  hasCompleted: boolean;
}

/**
 * 创建首个书签引导只面向「全量书签接口已确认返回 0」的新用户。
 * 初始空数组、标签/搜索空结果、接口失败都不能作为启动依据。
 */
export function shouldStartCreateBookmarkGuide(state: BookmarkGuideEligibility): boolean {
  return (
    !state.isMobile &&
    state.isBookmarkRoot &&
    state.isAllView &&
    !state.isLoading &&
    state.isAllLoaded &&
    state.bookmarkTotal === 0 &&
    state.visibleBookmarkCount === 0 &&
    !state.hasCompleted
  );
}
