import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ first: vi.fn() }));
vi.mock('./schema.js', () => ({ publicResourceSchemaReady: vi.fn().mockResolvedValue(true) }));
vi.mock('./core.js', async (load) => ({ ...(await load()), first: mocks.first }));
import { startPublicResourceEventScheduler } from './notifications.js';
let stop;
beforeEach(() => {
  vi.useFakeTimers();
  mocks.first.mockReset();
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
});
it('drains a backlog within the same tick, stops at its bound and stops polling on disposal', async () => {
  mocks.first.mockResolvedValue({ id: 1 });
  const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 0 }]) };
  stop = startPublicResourceEventScheduler({ db, env: { LIGHTNOTE_RUNTIME_ENV: 'production' } });
  await vi.advanceTimersByTimeAsync(0);
  expect(db.query).toHaveBeenCalledTimes(50);
  mocks.first.mockResolvedValue(null);
  await vi.advanceTimersByTimeAsync(5000);
  expect(db.query).toHaveBeenCalledTimes(50);
  expect(mocks.first).toHaveBeenCalledTimes(51);
  stop();
  await vi.advanceTimersByTimeAsync(10000);
  expect(mocks.first).toHaveBeenCalledTimes(51);
});
it('does not consume production jobs locally and reports failure once before a later retry', async () => {
  const db = { query: vi.fn() },
    onError = vi.fn();
  stop = startPublicResourceEventScheduler({ db, env: { LIGHTNOTE_RUNTIME_ENV: 'local' }, onError });
  await vi.advanceTimersByTimeAsync(10000);
  expect(mocks.first).not.toHaveBeenCalled();
  mocks.first.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(null);
  stop = startPublicResourceEventScheduler({ db, env: { LIGHTNOTE_RUNTIME_ENV: 'production' }, onError });
  await vi.advanceTimersByTimeAsync(0);
  expect(onError).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5000);
  expect(mocks.first).toHaveBeenCalledTimes(2);
});
it('does not overlap polls or continue draining after shutdown while a claim is pending', async () => {
  let release;
  mocks.first.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 0 }]) };
  stop = startPublicResourceEventScheduler({ db, env: { LIGHTNOTE_RUNTIME_ENV: 'production' } });
  await vi.advanceTimersByTimeAsync(10000);
  expect(mocks.first).toHaveBeenCalledTimes(1);
  stop();
  release({ id: 1 });
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.first).toHaveBeenCalledTimes(1);
});
