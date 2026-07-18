import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import BDrawer from './BDrawer.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.querySelectorAll('.b-drawer-wrapper').forEach((element) => element.remove());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('BDrawer compositor cleanup', () => {
  it('releases the transform layer even when transitionend is not emitted', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup() {
        return () => h(BDrawer, { open: true, title: 'Test drawer' });
      },
    });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    await nextTick();
    await nextTick();
    const wrapper = document.querySelector('.b-drawer-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.classList.contains('is-entered')).toBe(true);
    expect(wrapper!.classList.contains('is-settled')).toBe(false);

    vi.advanceTimersByTime(240);
    await nextTick();
    expect(wrapper!.classList.contains('is-settled')).toBe(true);
  });
});
