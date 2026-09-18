import type { RouteLocationNormalizedLoaded } from 'vue-router';
type CommunityRoute = Pick<RouteLocationNormalizedLoaded, 'path' | 'meta'>;
export function isCommunityRoute(route: CommunityRoute) {
  return route.path === '/community-chat' || route.path === '/community' || route.path.startsWith('/community/');
}
export function isCommunityChatRoute(route: CommunityRoute) {
  return route.meta.communityView === 'chat' || route.path === '/community-chat' || route.path === '/community/chat';
}

// Keep embedded actions and text selection independent from the surrounding post link.
export function shouldOpenCommunityPost(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !window.getSelection()?.toString() &&
    event.target instanceof Element &&
    !event.target.closest('a, button, input, textarea, select, [role="button"], [role="dialog"]')
  );
}

/** A changed head caused by deletion is not a new post. An initially empty feed can receive its first post. */
export function hasNewCommunityPost(
  next: { publicId: string; publishedAt: string } | undefined,
  headId: string,
  headPublishedAt: string,
  visibleIds: string[],
) {
  if (!next || next.publicId === headId || visibleIds.includes(next.publicId)) return false;
  if (!headId) return true;
  const previousTime = Date.parse(headPublishedAt);
  const nextTime = Date.parse(next.publishedAt);
  return !Number.isFinite(previousTime) || (Number.isFinite(nextTime) && nextTime >= previousTime);
}
