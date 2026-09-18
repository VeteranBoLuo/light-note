import { describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter } from 'vue-router';
import chat, { communityRoutes } from '@/router/modules/communityChat';
import { isCommunityRoute, isCommunityChatRoute } from './communityNavigation';
describe('community routing', () => {
  const router = createRouter({ history: createMemoryHistory(), routes: [chat, ...communityRoutes] });
  it('keeps old named links, queries and hashes on the same chat component', () => {
    const old = router.resolve('/community-chat?message=msg&room=general#anchor');
    const next = router.resolve('/community/chat?message=msg&room=general#anchor');
    expect(old.name).toBe('communityChat');
    expect(next.name).toBe(old.name);
    expect(old.query).toEqual(next.query);
    expect(old.hash).toBe(next.hash);
    expect(old.matched[0].components?.default).toBe(next.matched[0].components?.default);
    expect(isCommunityChatRoute(old)).toBe(true);
    expect(isCommunityChatRoute(next)).toBe(true);
  });
  it('does not treat profile/feed or an unrelated prefix as chat activation', () => {
    expect(isCommunityRoute({ path: '/community/profile', meta: {} })).toBe(true);
    expect(isCommunityChatRoute({ path: '/community/feed', meta: {} })).toBe(false);
    expect(isCommunityRoute({ path: '/community-chat-other', meta: {} })).toBe(false);
  });
});

import { hasNewCommunityPost } from './communityNavigation';
describe('new community content', () => {
  const next = { publicId: 'new', publishedAt: '2026-09-17T10:00:00Z' };
  it('announces the first post in an empty feed and a newer unseen post', () => {
    expect(hasNewCommunityPost(next, '', '', [])).toBe(true);
    expect(hasNewCommunityPost(next, 'old', '2026-09-17T09:00:00Z', ['old'])).toBe(true);
  });
  it('does not announce unchanged heads, empty responses, or previously visible posts', () => {
    expect(hasNewCommunityPost(next, 'new', next.publishedAt, [])).toBe(false);
    expect(hasNewCommunityPost(undefined, 'old', '', [])).toBe(false);
    expect(hasNewCommunityPost(next, 'removed', '', ['new'])).toBe(false);
  });
  it('does not call an older replacement head new content', () => {
    expect(hasNewCommunityPost(next, 'removed', '2026-09-17T11:00:00Z', [])).toBe(false);
  });
});
