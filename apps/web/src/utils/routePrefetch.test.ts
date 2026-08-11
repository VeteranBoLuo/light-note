import { describe, expect, it, vi } from 'vitest';
import { prefetchResolvedRoute } from './routePrefetch';

describe('routePrefetch', () => {
  it('deduplicates the same lazy route loader across repeated intent events', async () => {
    const loader = vi.fn(async () => ({ default: {} }));
    const router = {
      resolve: vi.fn(() => ({ matched: [{ components: { default: loader } }] })),
    } as any;

    await Promise.all([
      prefetchResolvedRoute(router, '/note/1'),
      prefetchResolvedRoute(router, '/note/1'),
      prefetchResolvedRoute(router, '/note/1'),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('allows a failed preload to retry on the next intent', async () => {
    const loader = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ default: {} });
    const router = {
      resolve: vi.fn(() => ({ matched: [{ components: { default: loader } }] })),
    } as any;

    await expect(prefetchResolvedRoute(router, '/note/2')).rejects.toThrow('offline');
    await expect(prefetchResolvedRoute(router, '/note/2')).resolves.toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
