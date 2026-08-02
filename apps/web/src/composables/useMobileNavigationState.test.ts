import { afterEach, describe, expect, it } from 'vitest';
import { useMobileNavigationState } from './useMobileNavigationState';

afterEach(() => {
  document.body.innerHTML = '';
  sessionStorage.clear();
});

describe('useMobileNavigationState', () => {
  it('切换资料 Tab 后始终回到新页面顶部，不恢复旧滚动位置', () => {
    const scroll = document.createElement('div');
    scroll.dataset.mobileResourceScroll = '';
    scroll.getClientRects = () => [{ width: 320, height: 600 }] as unknown as DOMRectList;
    document.body.append(scroll);

    const { resetResourceScroll } = useMobileNavigationState();
    scroll.scrollTop = 268;
    expect(resetResourceScroll('/home')).toBe(true);
    expect(scroll.scrollTop).toBe(0);

    scroll.scrollTop = 144;
    expect(resetResourceScroll('/cloudSpace')).toBe(true);
    expect(scroll.scrollTop).toBe(0);
  });

  it('底部主 Tab 切换只重置页面主滚动区，不改动 AI 等组件自己的滚动策略', () => {
    document.body.innerHTML = `
      <main class="mobile-app-shell__content">
        <section data-mobile-primary-scroll></section>
        <section data-mobile-resource-scroll></section>
        <section class="messages-container"></section>
      </main>
    `;
    const primary = document.querySelector<HTMLElement>('[data-mobile-primary-scroll]')!;
    const resource = document.querySelector<HTMLElement>('[data-mobile-resource-scroll]')!;
    const messages = document.querySelector<HTMLElement>('.messages-container')!;
    primary.scrollTop = 180;
    resource.scrollTop = 96;
    messages.scrollTop = 320;

    useMobileNavigationState().resetMobilePrimaryScroll();

    expect(primary.scrollTop).toBe(0);
    expect(resource.scrollTop).toBe(0);
    expect(messages.scrollTop).toBe(320);
  });
});
