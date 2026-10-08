import { expect, it, vi } from 'vitest';
import { createWorkerResourceGate } from './workerResourceGate.js';

it('caps heavy work, releases on failure and skips unclaimed work after shutdown', async () => {
  const run = createWorkerResourceGate(2);
  const finish = [];
  let active = 0;
  let peak = 0;
  let stopped = false;
  const work = () =>
    new Promise((resolve, reject) => {
      active += 1;
      peak = Math.max(peak, active);
      finish.push((error) => {
        active -= 1;
        error ? reject(error) : resolve(true);
      });
    });
  const skipped = vi.fn();
  const pending = [run(work), run(work), run(work), run(skipped, () => stopped)];
  const results = Promise.allSettled(pending);
  await vi.waitFor(() => expect(finish).toHaveLength(2));
  finish[0](new Error('synthetic decoder failure'));
  await vi.waitFor(() => expect(finish).toHaveLength(3));
  stopped = true;
  finish[1]();
  finish[2]();
  expect((await results).map((result) => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled', 'fulfilled']);
  expect(skipped).not.toHaveBeenCalled();
  expect(peak).toBe(2);
});
