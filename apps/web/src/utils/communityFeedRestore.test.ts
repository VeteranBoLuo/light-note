import { describe, expect, it, vi } from 'vitest';
import { restoreCommunityFeed } from './communityFeedRestore';
const post = (id: string, day: number) => ({ publicId: id, publishedAt: `2026-09-${day}T00:00:00Z` });
const memory = { anchor: 'old', anchorPublishedAt: post('old', 18).publishedAt };
describe('community feed reading restoration', () => {
  it('keeps newer posts when restoring an older post on the first page', async () => {
    const items = [post('new', 22), post('middle', 21), post('old', 18)];
    const fetch = vi.fn().mockResolvedValue({ items, nextCursor: 'next' });
    expect((await restoreCommunityFeed(fetch, memory, () => true))?.items).toEqual(items);
    expect(fetch).toHaveBeenCalledExactlyOnceWith();
  });
  it('loads contiguous pages from the newest post to the reading anchor', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ items: [post('new', 22)], nextCursor: 'page2' })
      .mockResolvedValueOnce({ items: [post('new', 22), post('old', 18)], nextCursor: 'page3' });
    const result = await restoreCommunityFeed(fetch, memory, () => true);
    expect(result?.items.map((p) => p.publicId)).toEqual(['new', 'old']);
    expect(result?.nextCursor).toBe('page3');
    expect(fetch.mock.calls).toEqual([[], ['page2']]);
  });
  it('stops after passing a removed anchor and falls back to the latest page for legacy memory', async () => {
    const fetch = vi.fn().mockResolvedValue({ items: [post('earlier', 17)], nextCursor: 'next' });
    await restoreCommunityFeed(fetch, memory, () => true);
    expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockClear();
    await restoreCommunityFeed(fetch, { anchor: 'old' }, () => true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('preserves loaded posts and a retry cursor on continuation failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ items: [post('new', 22)], nextCursor: 'retry' })
      .mockRejectedValueOnce(new Error('offline'));
    expect(await restoreCommunityFeed(fetch, memory, () => true)).toEqual({
      items: [post('new', 22)],
      nextCursor: 'retry',
      restoreFailed: true,
    });
  });
  it('discards stale requests and does not continue fetching', async () => {
    const fetch = vi.fn().mockResolvedValue({ items: [post('new', 22)], nextCursor: 'next' });
    expect(await restoreCommunityFeed(fetch, memory, () => false)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('stops at the end of the feed or a repeated cursor', async () => {
    const fetch = vi.fn().mockResolvedValue({ items: [post('new', 22)], nextCursor: 'same' });
    await restoreCommunityFeed(fetch, memory, () => true);
    expect(fetch).toHaveBeenCalledTimes(2);
    fetch.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    expect((await restoreCommunityFeed(fetch, memory, () => true))?.items).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
