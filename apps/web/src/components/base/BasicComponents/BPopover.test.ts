import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import BPopover from './BPopover.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function flushPosition() {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

describe('BPopover', () => {
  it('上方浮层内容变高时保持底边锚定，避免 ResizeObserver 二次改 top 闪动', async () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    class ResizeObserverStub {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () {
      return this === document.documentElement ? 1000 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () {
      return this === document.documentElement ? 800 : 0;
    });
    let panelHeight = 100;
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function () {
      return this.classList.contains('b-popover-panel') ? 240 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function () {
      return this.classList.contains('b-popover-panel') ? panelHeight : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.classList.contains('b-popover-trigger')) {
        return {
          x: 120,
          y: 500,
          top: 500,
          right: 480,
          bottom: 540,
          left: 120,
          width: 360,
          height: 40,
          toJSON: () => ({}),
        };
      }
      return {
        x: 0,
        y: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      };
    });

    const open = ref(false);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      components: { BPopover },
      setup: () => ({ open }),
      template: `
        <BPopover v-model:open="open" trigger="manual" placement="top-left">
          <span>触发器</span>
          <template #content><div>动态内容</div></template>
        </BPopover>
      `,
    });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    open.value = true;
    await flushPosition();
    const panel = document.body.querySelector<HTMLElement>('.b-popover-panel');
    expect(panel?.style.top).toBe('auto');
    expect(panel?.style.bottom).toBe('306px');
    expect(panel?.style.left).toBe('120px');

    panelHeight = 220;
    resizeCallback?.([], {} as ResizeObserver);
    expect(panel?.style.top).toBe('auto');
    expect(panel?.style.bottom).toBe('306px');
  });
});
