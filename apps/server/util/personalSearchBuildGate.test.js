import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let acquire;
beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  ({ acquirePersonalSearchBuild: acquire } = await import('./personalSearchBuildGate.js'));
});
afterEach(() => vi.useRealTimers());

it('admits FIFO one at a time and makes release idempotent', async () => {
  const first = await acquire();
  const order = [];
  const second = acquire().then((release) => {
    order.push(2);
    return release;
  });
  const third = acquire().then((release) => {
    order.push(3);
    return release;
  });
  expect(order).toEqual([]);
  first();
  const releaseSecond = await second;
  first();
  expect(order).toEqual([2]);
  releaseSecond();
  (await third)();
  expect(order).toEqual([2, 3]);
  expect(vi.getTimerCount()).toBe(0);
});

it('bounds waiting callers and releases all capacity after a burst', async () => {
  const first = await acquire();
  const queued = Array.from({ length: 32 }, () => acquire());
  await expect(acquire()).rejects.toMatchObject({ code: 'AI_PERSONAL_SEARCH_BUSY', status: 503 });
  first();
  for (const pending of queued) (await pending)();
  (await acquire())();
  expect(vi.getTimerCount()).toBe(0);
});

it('expires queued requests without taking an active slot or leaking queue entries', async () => {
  const first = await acquire();
  const expired = expect(acquire()).rejects.toMatchObject({ code: 'AI_PERSONAL_SEARCH_BUSY' });
  await vi.advanceTimersByTimeAsync(30_000);
  await expired;
  const replacement = acquire();
  first();
  (await replacement)();
  expect(vi.getTimerCount()).toBe(0);
});
