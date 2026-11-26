import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImageRepairCanvas from './ImageRepairCanvas.vue';

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

let unmount: (() => void) | undefined;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(640);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(480);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  unmount?.();
  unmount = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mountCanvas(src = 'blob:repair-test') {
  const select = vi.fn();
  const host = document.createElement('div');
  const app = createApp(ImageRepairCanvas, {
    width: 640,
    height: 480,
    src,
    selections: [],
    activeIndex: -1,
    mode: 'rectangle',
    brushSize: 24,
    editable: true,
    showSelections: true,
    onSelect: select,
  });
  app.mount(host);
  unmount = () => app.unmount();
  const viewport = host.querySelector<HTMLElement>('.repair-canvas__viewport')!;
  viewport.setPointerCapture = vi.fn();
  viewport.hasPointerCapture = vi.fn(() => false);

  function send(type: string, x: number, y: number, buttons: number, button = 0) {
    viewport.dispatchEvent(
      new PointerEvent(type, {
        pointerId: 1,
        pointerType: 'mouse',
        button,
        buttons,
        clientX: x,
        clientY: y,
        bubbles: true,
      }),
    );
  }

  function drawDraft() {
    send('pointerdown', 40, 40, 1);
    send('pointermove', 150, 100, 1);
  }

  return { select, send, drawDraft, host, viewport };
}

it('未选图片时不绘制选区，缩放按钮禁用，画布不会进入键盘焦点顺序', () => {
  const { host, viewport, select, drawDraft, send } = mountCanvas('');
  const zoomButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('.repair-canvas__zoom button'));
  expect(zoomButtons.map((button) => button.disabled)).toEqual([true, true, true]);
  expect(viewport.hasAttribute('tabindex')).toBe(false);
  expect(viewport.querySelector('canvas')).toBeNull();
  drawDraft();
  send('pointerup', 150, 100, 0);
  expect(select).not.toHaveBeenCalled();
});

const firstRectangle = { kind: 'rectangle', x: 40, y: 40, width: 110, height: 60 };
const secondRectangle = { kind: 'rectangle', x: 250, y: 160, width: 130, height: 120 };

it.each([
  { button: 1, mask: 4 },
  { button: 2, mask: 2 },
])('鼠标辅助键 $button 按住时平移，丢失松手事件后可直接框选', async ({ button, mask }) => {
  const { host, select, send, drawDraft } = mountCanvas();
  const image = host.querySelector<HTMLElement>('.repair-canvas__image')!;
  host.querySelectorAll<HTMLButtonElement>('.repair-canvas__zoom button')[2].click();
  await nextTick();
  const left = parseFloat(image.style.left);

  send('pointerdown', 40, 40, mask, button);
  send('pointermove', 70, 40, mask, -1);
  await nextTick();
  expect(parseFloat(image.style.left)).toBe(left + 30);

  send('pointermove', 100, 40, 0, -1);
  await nextTick();
  expect(parseFloat(image.style.left)).toBe(left + 30);
  expect(select).not.toHaveBeenCalled();

  drawDraft();
  send('pointerup', 150, 100, 0);
  expect(select).toHaveBeenCalledOnce();
});

describe('图片修复画布的鼠标拖动恢复', () => {
  it('丢失松手事件后，首次未按键移动会保留已画框并结束上一轮拖动', () => {
    const { select, send, drawDraft } = mountCanvas();
    drawDraft();
    send('pointermove', 40, 40, 0);
    send('pointermove', 190, 120, 0);
    expect(select.mock.calls).toEqual([[firstRectangle]]);
  });

  it('丢失松手事件后，下一次按下可以直接开始新框选', () => {
    const { select, send, drawDraft } = mountCanvas();
    drawDraft();
    send('pointerdown', 250, 160, 1);
    send('pointermove', 380, 280, 1);
    send('pointerup', 380, 280, 0);
    expect(select.mock.calls).toEqual([[firstRectangle], [secondRectangle]]);
  });

  it('丢失指针捕获只提交一次，浏览器取消手势则丢弃草稿', () => {
    const { select, send, drawDraft } = mountCanvas();
    drawDraft();
    send('lostpointercapture', 155, 110, 1);
    send('pointerup', 155, 110, 0);
    send('pointerdown', 250, 160, 1);
    send('pointermove', 380, 280, 1);
    send('pointercancel', 380, 280, 0);
    send('lostpointercapture', 380, 280, 0);
    expect(select.mock.calls).toEqual([[firstRectangle]]);
  });
});
