import { expect, it, vi } from 'vitest';
import {
  beginRequestActivity,
  endRequestActivity,
  holdRequestActivity,
  requestActivitySnapshot,
  subscribeRequestActivity,
  withRequestActivity,
} from './requestActivity';
it('counts independent purposes without exposing request objects and releases idempotently', () => {
  const listener = vi.fn();
  const unsubscribe = subscribeRequestActivity(listener);
  const token = { url: '/private' };
  beginRequestActivity(token);
  beginRequestActivity(token);
  const release = holdRequestActivity('incremental');
  const passive = holdRequestActivity('background');
  expect(requestActivitySnapshot()).toMatchObject({ foreground: 1, incremental: 1, background: 1 });
  expect(JSON.stringify(listener.mock.calls)).not.toContain('private');
  endRequestActivity(token);
  endRequestActivity(token);
  release();
  release();
  passive();
  expect(requestActivitySnapshot()).toEqual({
    foreground: 0,
    incremental: 0,
    background: 0,
    oldestIncrementalAt: null,
  });
  unsubscribe();
});
it('failure and cancellation release the full operation', async () => {
  await expect(
    withRequestActivity('incremental', async () => {
      throw new DOMException('canceled', 'AbortError');
    }),
  ).rejects.toThrow('canceled');
  expect(requestActivitySnapshot().incremental).toBe(0);
});
