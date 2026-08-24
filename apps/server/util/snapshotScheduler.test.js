import { describe, expect, it, vi } from 'vitest';
import { createBackgroundArchiveScheduler } from './snapshot.js';

describe('background bookmark archive scheduler', () => {
  it('同时限制全局并发、全局积压和单账号积压，且不以异常阻断调用方', async () => {
    const resolvers = [];
    const run = vi.fn(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const onDrop = vi.fn();
    const scheduler = createBackgroundArchiveScheduler({
      run,
      concurrency: 1,
      maxOutstanding: 2,
      maxOutstandingPerActor: 1,
      onDrop,
    });

    expect(scheduler.schedule('user-1', 'bookmark-1')).toBe(true);
    expect(scheduler.schedule('user-1', 'bookmark-2')).toBe(false);
    expect(scheduler.schedule('user-2', 'bookmark-3')).toBe(true);
    expect(scheduler.schedule('user-3', 'bookmark-4')).toBe(false);
    expect(scheduler.status()).toEqual({ active: 1, queued: 1, total: 2 });
    expect(onDrop).toHaveBeenNthCalledWith(1, 'actor_limit');
    expect(onDrop).toHaveBeenNthCalledWith(2, 'global_limit');

    await vi.waitFor(() => expect(run).toHaveBeenCalledWith('user-1', 'bookmark-1'));
    resolvers.shift()?.();
    await vi.waitFor(() => expect(run).toHaveBeenCalledWith('user-2', 'bookmark-3'));
    resolvers.shift()?.();
    await vi.waitFor(() => expect(scheduler.status()).toEqual({ active: 0, queued: 0, total: 0 }));
  });

  it('后台任务失败后仍释放名额并继续处理下一项', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('fetch failed')).mockResolvedValueOnce(undefined);
    const scheduler = createBackgroundArchiveScheduler({
      run,
      concurrency: 1,
      maxOutstanding: 2,
      maxOutstandingPerActor: 2,
    });

    expect(scheduler.schedule('user-1', 'bookmark-1')).toBe(true);
    expect(scheduler.schedule('user-1', 'bookmark-2')).toBe(true);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(scheduler.status().total).toBe(0));
  });
});
