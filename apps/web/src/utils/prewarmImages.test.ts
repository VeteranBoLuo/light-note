import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { observePrewarmImages } from './prewarmImages';
import { requestActivitySnapshot } from '@/http/requestActivity';
let notify: IntersectionObserverCallback;
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  stop?.();
  stop = undefined;
  document.body.innerHTML = '';
  expect(requestActivitySnapshot().incremental).toBe(0);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const visible = (image: HTMLImageElement, value: boolean) =>
  notify([{ target: image, isIntersecting: value } as IntersectionObserverEntry], {} as IntersectionObserver);
function image() {
  const element = document.createElement('img');
  element.src = '/slow.png';
  Object.defineProperty(element, 'complete', { configurable: true, value: false });
  document.body.append(element);
  return element;
}
it('offscreen images do not block; scroll and repeated visibility do not reset a pending image', async () => {
  const element = image();
  stop = observePrewarmImages();
  expect(requestActivitySnapshot().incremental).toBe(0);
  visible(element, true);
  const start = requestActivitySnapshot().oldestIncrementalAt;
  await vi.advanceTimersByTimeAsync(700);
  window.dispatchEvent(new Event('scroll'));
  visible(element, true);
  expect(requestActivitySnapshot()).toMatchObject({ incremental: 1, oldestIncrementalAt: start });
  visible(element, false);
  expect(requestActivitySnapshot().incremental).toBe(0);
});
it.each(['load', 'error'])('%s and removal release loading records', async (event) => {
  const element = image();
  stop = observePrewarmImages();
  visible(element, true);
  element.dispatchEvent(new Event(event));
  expect(requestActivitySnapshot().incremental).toBe(0);
  visible(element, true);
  element.remove();
  await vi.advanceTimersByTimeAsync(60);
  expect(requestActivitySnapshot().incremental).toBe(0);
});
it('source changes get their own waiting period and teardown releases pending images', async () => {
  const element = image();
  stop = observePrewarmImages();
  visible(element, true);
  const original = requestActivitySnapshot().oldestIncrementalAt!;
  await vi.advanceTimersByTimeAsync(700);
  element.src = '/replacement.png';
  await vi.advanceTimersByTimeAsync(60);
  expect(requestActivitySnapshot().incremental).toBe(1);
  expect(requestActivitySnapshot().oldestIncrementalAt).toBeGreaterThan(original);
  stop();
  stop = undefined;
  expect(requestActivitySnapshot().incremental).toBe(0);
});
it('hiding a still-pending image releases it without waiting for a network event', async () => {
  const element = image();
  stop = observePrewarmImages();
  visible(element, true);
  expect(requestActivitySnapshot().incremental).toBe(1);
  element.style.visibility = 'hidden';
  await vi.advanceTimersByTimeAsync(60);
  expect(requestActivitySnapshot().incremental).toBe(0);
  element.style.visibility = 'visible';
  await vi.advanceTimersByTimeAsync(60);
  expect(requestActivitySnapshot().incremental).toBe(1);
});
