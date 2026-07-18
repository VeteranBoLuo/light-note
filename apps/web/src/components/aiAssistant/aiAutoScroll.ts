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
