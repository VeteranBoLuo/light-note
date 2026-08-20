import { createApp, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DrawingNoteEditor from './DrawingNoteEditor.vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

vi.mock('@/components/base/BasicComponents/BModal/Alert.ts', () => ({
  default: { alert: vi.fn() },
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span />' },
}));

vi.mock('@/utils/fileDelivery', () => ({
  buildExportFileName: vi.fn(() => 'drawing.png'),
  deliverGeneratedFile: vi.fn(),
}));

vi.mock('@/utils/androidBridge', () => ({ isLightNoteAndroidApp: vi.fn(() => false) }));
vi.mock('@/utils/androidFileExport', () => ({ deliverExportViaAndroidBridge: vi.fn() }));

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

function canvasContextStub() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textBaseline: 'alphabetic',
  } as unknown as CanvasRenderingContext2D;
}

describe('DrawingNoteEditor 活动手势撤销', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContextStub());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('按住第二笔时撤销只取消第二笔，松开后也不会重新提交', async () => {
    const updates: string[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(DrawingNoteEditor, {
      content: JSON.stringify({ v: 2, page: { width: 1448, height: 1448 }, elements: [] }),
      'onUpdate:content': (content: string) => updates.push(content),
    });
    app.mount(host);
    await nextTick();
    const canvasElement = host.querySelector('canvas') as HTMLCanvasElement;
    const editorElement = host.querySelector('.drawing-editor') as HTMLElement;
    Object.defineProperties(canvasElement, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, right: 1448, bottom: 1448, width: 1448, height: 1448 }),
      },
    });

    const pointer = (type: string, pointerId: number, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
      Object.defineProperty(event, 'pointerId', { value: pointerId });
      canvasElement.dispatchEvent(event);
    };

    pointer('pointerdown', 1, 100, 100);
    pointer('pointermove', 1, 180, 180);
    pointer('pointerup', 1, 180, 180);
    await nextTick();
    expect(updates).toHaveLength(1);

    pointer('pointerdown', 2, 300, 300);
    pointer('pointermove', 2, 420, 420);
    editorElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'z', metaKey: true }));
    pointer('pointerup', 2, 420, 420);
    await nextTick();

    expect(updates).toHaveLength(1);
    expect(JSON.parse(updates[0]).elements).toHaveLength(1);
    expect(canvasElement.releasePointerCapture).toHaveBeenCalledWith(2);

    editorElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'z', metaKey: true }));
    await nextTick();
    expect(updates).toHaveLength(2);
    expect(JSON.parse(updates[1]).elements).toHaveLength(0);
    app.unmount();
    host.remove();
  });
});
