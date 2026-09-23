import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, shallowRef } from 'vue';
import { applyUiDensity } from './useUiDensity';
import { useDensityScrollAnchor } from './useDensityScrollAnchor';

const scopes: ReturnType<typeof effectScope>[] = [];
function fixture() {
  const el = document.createElement('div');
  const child = document.createElement('section');
  el.append(child);
  document.body.append(el);
  const size = { total: 1000, start: 200, height: 400 };
  Object.defineProperties(el, {
    clientHeight: { value: 300 },
    scrollHeight: { get: () => size.total },
  });
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 50 } as DOMRect);
  vi.spyOn(child, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        top: 50 + size.start - el.scrollTop,
        bottom: 50 + size.start - el.scrollTop + size.height,
        height: size.height,
      }) as DOMRect,
  );
  const ref = shallowRef<HTMLElement | null>(el);
  const scope = effectScope();
  scope.run(() => useDensityScrollAnchor(ref));
  scopes.push(scope);
  return { el, child, size, ref, scope };
}
beforeEach(() => {
  applyUiDensity('medium');
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('density reading anchors', () => {
  it('retains the bottom after content shrinks or grows', async () => {
    const { el, size } = fixture();
    el.scrollTop = 700;
    applyUiDensity('small');
    size.total = 850;
    await nextTick();
    expect(el.scrollTop).toBe(550);
    applyUiDensity('large');
    size.total = 1150;
    await nextTick();
    expect(el.scrollTop).toBe(850);
  });
  it('keeps the same reading point within a partially visible section', async () => {
    const { el, size } = fixture();
    el.scrollTop = 300; // one quarter into the section
    applyUiDensity('small');
    size.start = 160;
    size.height = 320;
    await nextTick();
    expect(el.scrollTop).toBe(240);
    applyUiDensity('medium');
    size.start = 200;
    size.height = 400;
    await nextTick();
    expect(el.scrollTop).toBe(300);
  });
  it('does not scroll a panel at the top or rewrite an unchanged density', async () => {
    const { el, size } = fixture();
    applyUiDensity('small');
    size.total = 850;
    await nextTick();
    expect(el.scrollTop).toBe(0);
    el.scrollTop = 400;
    applyUiDensity('small');
    size.total = 900;
    await nextTick();
    expect(el.scrollTop).toBe(400);
  });
  it('cancels pending restoration after unmount or container replacement', async () => {
    const first = fixture();
    first.el.scrollTop = 700;
    applyUiDensity('small');
    first.size.total = 850;
    first.scope.stop();
    await nextTick();
    expect(first.el.scrollTop).toBe(700);
    const second = fixture();
    second.el.scrollTop = 700;
    applyUiDensity('large');
    second.size.total = 1200;
    second.ref.value = null;
    await nextTick();
    expect(second.el.scrollTop).toBe(700);
  });
  it('cancels a queued browser frame when its scope stops', async () => {
    let restore: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      restore = callback;
      return 7;
    });
    const { el, size, scope } = fixture();
    el.scrollTop = 700;
    applyUiDensity('small');
    size.total = 850;
    await nextTick();
    scope.stop();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
    restore?.(0);
    expect(el.scrollTop).toBe(700);
  });
});
