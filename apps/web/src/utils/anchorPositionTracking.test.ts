import { afterEach, expect, it, vi } from 'vitest';
import { createAnchorPositionTracker } from './anchorPositionTracking';

afterEach(() => vi.unstubAllGlobals());

it('follows delayed ancestor movement, becomes idle, and cancels work on close', () => {
  const pending = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    pending.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => pending.delete(id));
  const tick = () => {
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach(callback => callback(0));
  };
  let top = 100;
  let active = true;
  const anchor = document.createElement('button');
  vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => ({
    left: 20, top, right: 120, bottom: top + 30,
  }) as DOMRect);
  const update = vi.fn();
  const tracker = createAnchorPositionTracker({ getAnchor: () => anchor, isActive: () => active, update });
  tracker.start();
  tick();
  tick();
  top = 146;
  tick();
  expect(update).toHaveBeenCalledTimes(2);
  for (let frame = 0; frame < 20; frame++) tick();
  expect(pending.size).toBe(0);
  expect(update).toHaveBeenCalledTimes(2);
  tracker.start();
  tracker.stop();
  expect(pending.size).toBe(0);
  tracker.start();
  active = false;
  tick();
  expect(pending.size).toBe(0);
  expect(update).toHaveBeenCalledTimes(2);
});
