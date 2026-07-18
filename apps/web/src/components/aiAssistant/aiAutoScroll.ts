export const AI_CHAT_SCROLL_PAUSE_THRESHOLD = 120;
export const AI_CHAT_SCROLL_RESUME_THRESHOLD = 8;

export type ScrollMetrics = Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>;

export function getAiChatBottomDistance(container: ScrollMetrics): number {
  return Math.max(0, container.scrollHeight - container.scrollTop - container.clientHeight);
}

export function shouldPauseAiChatFollow(distance: number): boolean {
  return distance > AI_CHAT_SCROLL_PAUSE_THRESHOLD;
}

export function shouldResumeAiChatFollow(distance: number): boolean {
  return distance <= AI_CHAT_SCROLL_RESUME_THRESHOLD;
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
  const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
  const scrollTop = Math.min(Math.max(0, preservedScrollTop), maxScrollTop);
  const distance = getAiChatBottomDistance({ ...metrics, scrollTop });
  const shouldFollow = shouldResumeAiChatFollow(distance);
  return {
    scrollTop,
    shouldFollow,
    showScrollToBottom: !shouldFollow,
  };
}

export function isAiChatUpwardWheel(deltaY: number): boolean {
  return deltaY < 0;
}

export function isAiChatUpwardScroll(previousTop: number, currentTop: number): boolean {
  return currentTop < previousTop;
}

/** 手指向下移动代表内容在向上滚动。 */
export function isAiChatUpwardTouch(previousY: number | null, currentY: number): boolean {
  return previousY !== null && currentY > previousY;
}
