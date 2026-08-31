import { createApp, defineComponent, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BTooltip from './BTooltip.vue';

vi.mock('@/utils/zoom', () => ({ getRootZoom: () => 1 }));

describe('BTooltip 交互状态', () => {
  let app: ReturnType<typeof createApp> | null = null;
  let host: HTMLElement | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  });

  afterEach(() => {
    app?.unmount();
    host?.remove();
    document.querySelectorAll('.b-tooltip-popup').forEach((popup) => popup.remove());
    app = null;
    host = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('关闭时保留触发内容但不显示浮层，重新启用后可正常显示', async () => {
    const disabled = ref(true);
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(
      defineComponent({
        components: { BTooltip },
        setup: () => ({ disabled }),
        template: '<BTooltip title="领取构成" :disabled="disabled"><button id="claim">领取</button></BTooltip>',
      }),
    );
    app.mount(host);

    const trigger = host.querySelector('.b-tooltip-wrap') as HTMLElement;
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    vi.runAllTimers();
    await nextTick();
    expect(document.querySelector<HTMLElement>('.b-tooltip-popup')?.style.display).toBe('none');

    disabled.value = false;
    await nextTick();
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    vi.runAllTimers();
    await nextTick();
    expect(document.querySelector<HTMLElement>('.b-tooltip-popup')?.style.display).not.toBe('none');
  });

  it('点击触发内容后立即收起，并在指针离开前不重新遮挡目标名称', async () => {
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(
      defineComponent({
        components: { BTooltip },
        template: '<BTooltip title="更多入口"><button id="more">更多</button></BTooltip>',
      }),
    );
    app.mount(host);

    const trigger = host.querySelector('.b-tooltip-wrap') as HTMLElement;
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    vi.runAllTimers();
    await nextTick();
    const popup = document.querySelector<HTMLElement>('.b-tooltip-popup');
    expect(popup?.style.display).not.toBe('none');

    host.querySelector<HTMLButtonElement>('#more')?.click();
    await nextTick();
    expect(popup?.style.display).toBe('none');

    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    vi.runAllTimers();
    await nextTick();
    expect(popup?.style.display).toBe('none');

    trigger.dispatchEvent(new MouseEvent('mouseleave'));
    vi.runAllTimers();
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    vi.runAllTimers();
    await nextTick();
    expect(popup?.style.display).not.toBe('none');
  });
});
