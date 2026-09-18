import { createApp, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BBackToTop from './BBackToTop.vue';
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
let cleanup = () => {};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('BBackToTop', () => {
  it.each([false, true])('只滚动目标容器并遵循减少动态效果设置：%s', async (reducedMotion) => {
    vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
    const target = document.createElement('div');
    Object.defineProperty(target, 'clientHeight', { value: 500 });
    target.scrollTo = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(BBackToTop, { target, label: '回到顶部' });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    expect(host.querySelector('button')).toBeNull();
    target.scrollTop = 600;
    target.dispatchEvent(new Event('scroll'));
    await nextTick();
    host.querySelector<HTMLButtonElement>('button')!.click();
    expect(target.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    target.scrollTop = 0;
    target.dispatchEvent(new Event('scroll'));
    await nextTick();
    expect(host.querySelector('button')).toBeNull();
  });
});
