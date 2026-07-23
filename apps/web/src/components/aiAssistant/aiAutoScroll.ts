export const AI_CHAT_SCROLL_PAUSE_THRESHOLD = 120;
export const AI_CHAT_SCROLL_RESUME_THRESHOLD = 8;
export const AI_CHAT_TOUCH_INTENT_THRESHOLD = 24;

export type ScrollMetrics = Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>;

export function getAiChatMaxScrollTop(container: Pick<ScrollMetrics, 'scrollHeight' | 'clientHeight'>): number {
  return Math.max(0, container.scrollHeight - container.clientHeight);
}

export function getAiChatBottomDistance(container: ScrollMetrics): number {
  return Math.max(0, getAiChatMaxScrollTop(container) - container.scrollTop);
}

export function shouldPauseAiChatFollow(distance: number): boolean {
  return distance > AI_CHAT_SCROLL_PAUSE_THRESHOLD;
}

export function shouldResumeAiChatFollow(distance: number): boolean {
  return distance <= AI_CHAT_SCROLL_RESUME_THRESHOLD;
}

/** 已暂停跟随且确实离开底部一段距离后，才提示用户回到底部。 */
export function shouldShowAiChatScrollPrompt(distance: number, shouldFollow: boolean): boolean {
  return !shouldFollow && shouldPauseAiChatFollow(distance);
}

export interface AiChatStableViewportState {
  scrollTop: number;
  shouldFollow: boolean;
  showScrollToBottom: boolean;
}

/**
 * 来源、推荐项等回答后内容插入时保留原阅读位置，只在新内容仍位于视口下方时提示用户主动查看。
 */
export function resolveAiChatStableViewport(
  metrics: Pick<ScrollMetrics, 'scrollHeight' | 'clientHeight'>,
  preservedScrollTop: number,
): AiChatStableViewportState {
  const maxScrollTop = getAiChatMaxScrollTop(metrics);
  const scrollTop = Math.min(Math.max(0, preservedScrollTop), maxScrollTop);
  const distance = getAiChatBottomDistance({ ...metrics, scrollTop });
  const shouldFollow = shouldResumeAiChatFollow(distance);
  return {
    scrollTop,
    shouldFollow,
    showScrollToBottom: !shouldFollow,
  };
}

/**
 * 回答结束后插入来源等附属内容时：原本跟随底部的用户继续跟随，
 * 只有已经主动离开底部的用户才保留阅读位置。
 */
export function resolveAiChatPostAnswerViewport(
  metrics: Pick<ScrollMetrics, 'scrollHeight' | 'clientHeight'>,
  preservedScrollTop: number,
  wasFollowing: boolean,
): AiChatStableViewportState {
  if (!wasFollowing) return resolveAiChatStableViewport(metrics, preservedScrollTop);
  return {
    scrollTop: getAiChatMaxScrollTop(metrics),
    shouldFollow: true,
    showScrollToBottom: false,
  };
}

export function isAiChatUpwardWheel(deltaY: number): boolean {
  return deltaY < 0;
}

export function isAiChatUpwardScroll(previousTop: number, currentTop: number): boolean {
  return currentTop < previousTop;
}

/** 手指向下移动代表内容在向上滚动；越过触摸意图阈值后才暂停自动跟随。 */
export function isAiChatUpwardTouch(
  gestureStartY: number | null,
  currentY: number,
  threshold = AI_CHAT_TOUCH_INTENT_THRESHOLD,
): boolean {
  return gestureStartY !== null && currentY - gestureStartY >= threshold;
}
