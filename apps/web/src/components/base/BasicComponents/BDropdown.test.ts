import { createApp, h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import BDropdown from './BDropdown.vue';

async function flushPosition() {
  await nextTick();
  await Promise.resolve();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await nextTick();
}

describe('BDropdown 视口定位', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('触发按钮靠近视口底部时自动向上展开并保持在屏幕内', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      render: () =>
        h(
          BDropdown,
          {
            trigger: 'click',
            align: 'right',
            menuOptions: [
              { key: 'parent', label: '将已有页面移到本页下' },
              { key: 'child', label: '将本页移到其他页面下' },
            ],
          },
          { default: () => h('span', '页面关系') },
        ),
    });
    app.mount(host);
    cleanup = () => app.unmount();

    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1000 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 600 });
    const trigger = host.querySelector<HTMLElement>('.b-dropdown-trigger')!;
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 550,
      right: 900,
      bottom: 578,
      left: 800,
      width: 100,
      height: 28,
      x: 800,
      y: 550,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () {
      return (this as HTMLElement).classList.contains('b-dropdown-panel') ? 220 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      return (this as HTMLElement).classList.contains('b-dropdown-panel') ? 80 : 0;
    });

    trigger.click();
    await flushPosition();

    const panel = document.querySelector<HTMLElement>('.b-dropdown-panel')!;
    expect(panel.style.top).toBe('464px');
    expect(panel.style.left).toBe('680px');
    expect(Number.parseFloat(panel.style.top) + 80).toBeLessThanOrEqual(592);
    expect(panel.style.maxHeight).toBe('584px');
  });
});
