import { createApp, defineComponent, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BTooltip from './BTooltip.vue';

const zoomState = vi.hoisted(() => ({ value: 1 }));
vi.mock('@/utils/zoom', () => ({ getRootZoom: () => zoomState.value }));

describe('BTooltip 交互状态', () => {
  let app: ReturnType<typeof createApp> | null = null;
  let host: HTMLElement | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    zoomState.value = 1;
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

  function mountCursorTooltip() {
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(
      defineComponent({
        components: { BTooltip },
        template: '<BTooltip title="调整宽度" follow-cursor :delay="1000"><button>拖动</button></BTooltip>',
      }),
    );
    app.mount(host);
    const trigger = host.querySelector('.b-tooltip-wrap') as HTMLElement;
    const popup = document.querySelector('.b-tooltip-popup') as HTMLElement;
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 1280 });
    Object.defineProperty(document.documentElement, 'clientHeight', { configurable: true, value: 800 });
    Object.defineProperty(popup, 'offsetWidth', { configurable: true, value: 200 });
    Object.defineProperty(popup, 'offsetHeight', { configurable: true, value: 40 });
    return { trigger, popup };
  }

  it('等待 1 秒后使用最新鼠标位置，显示后持续跟随', async () => {
    const { trigger, popup } = mountCursorTooltip();
    trigger.dispatchEvent(new MouseEvent('mouseenter', { clientX: 100, clientY: 100 }));
    await vi.advanceTimersByTimeAsync(999);
    expect(popup.style.display).toBe('none');
    trigger.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 250 }));
    await vi.advanceTimersByTimeAsync(1);
    expect(popup.style.display).not.toBe('none');
    expect(popup.style.left).toBe('312px');
    expect(popup.style.top).toBe('262px');
    trigger.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 350 }));
    await nextTick();
    expect(popup.style.left).toBe('412px');
    expect(popup.style.top).toBe('362px');
  });

  it.each([1, 1.25])('zoom=%s 时在右下边缘翻转并保持在视口内', async (zoom) => {
    zoomState.value = zoom;
    const { trigger, popup } = mountCursorTooltip();
    trigger.dispatchEvent(new MouseEvent('mouseenter', { clientX: 1278, clientY: 798 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(parseFloat(popup.style.left)).toBeCloseTo((1278 - 12) / zoom - 200);
    expect(parseFloat(popup.style.top)).toBeCloseTo((798 - 12) / zoom - 40);
  });

  it('离开取消等待；按下立即关闭，拖动经过时不重新显示', async () => {
    const { trigger, popup } = mountCursorTooltip();
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.advanceTimersByTimeAsync(500);
    trigger.dispatchEvent(new MouseEvent('mouseleave'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(popup.style.display).toBe('none');
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.advanceTimersByTimeAsync(1000);
    trigger.querySelector('button')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, buttons: 1 }));
    await nextTick();
    expect(popup.style.display).toBe('none');
    trigger.dispatchEvent(new MouseEvent('mouseleave'));
    trigger.dispatchEvent(new MouseEvent('mouseenter', { buttons: 1 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(popup.style.display).toBe('none');
    trigger.dispatchEvent(new MouseEvent('mouseleave'));
    trigger.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(popup.style.display).not.toBe('none');
  });
});
