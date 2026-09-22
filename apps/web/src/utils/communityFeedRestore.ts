import type { FeedPage } from '@/api/communityFeedApi';

type Post = { publicId: string; publishedAt: string };
type Memory = { anchor?: string; anchorPublishedAt?: string };

// Always retain the newest page. A reading anchor is a scroll target, not a query boundary.
export async function restoreCommunityFeed<T extends Post>(
  fetchPage: (before?: string) => Promise<FeedPage<T>>,
  memory: Memory | null,
  isCurrent: () => boolean,
) {
  let page = await fetchPage();
  const seen = new Set<string>();
  const targetTime = Date.parse(memory?.anchorPublishedAt || '');
  let restoreFailed = false;
  while (isCurrent() && memory?.anchor && Number.isFinite(targetTime) && page.nextCursor) {
    if (page.items.some((post) => post.publicId === memory.anchor)) break;
    const oldestTime = Date.parse(page.items.at(-1)?.publishedAt || '');
    if (!Number.isFinite(oldestTime) || oldestTime < targetTime || seen.has(page.nextCursor)) break;
    seen.add(page.nextCursor);
    try {
      const next = await fetchPage(page.nextCursor);
      const ids = new Set(page.items.map((post) => post.publicId));
      page = { ...next, items: [...page.items, ...next.items.filter((post) => !ids.has(post.publicId))] };
    } catch {
      restoreFailed = true;
      break;
    }
  }
  return isCurrent() ? { ...page, restoreFailed } : null;
}
