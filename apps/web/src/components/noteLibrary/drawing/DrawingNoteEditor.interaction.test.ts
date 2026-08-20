import { createApp, nextTick, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DrawingNoteEditor from './DrawingNoteEditor.vue';
import { MOBILE_LAYOUT_CONTEXT } from '@/composables/useMobileLayout';

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
    rect: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    closePath: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
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
    globalCompositeOperation: 'source-over',
  } as unknown as CanvasRenderingContext2D;
}

describe('DrawingNoteEditor 活动手势撤销', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
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

  it('中键和右键可直接平移画布，不切换工具或生成笔画', async () => {
    const clientWidthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    const clientHeightSpy = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
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
    const pageElement = host.querySelector('.drawing-page') as HTMLElement;
    Object.defineProperties(canvasElement, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800 }),
      },
    });

    const pointer = (type: string, pointerId: number, button: number, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button, clientX: 400, clientY });
      Object.defineProperty(event, 'pointerId', { value: pointerId });
      return canvasElement.dispatchEvent(event);
    };

    const initialTransform = pageElement.style.transform;
    expect(pointer('pointerdown', 11, 1, 300)).toBe(false);
    pointer('pointermove', 11, 1, 360);
    await nextTick();
    const middlePanTransform = pageElement.style.transform;
    expect(middlePanTransform).not.toBe(initialTransform);
    pointer('pointerup', 11, 1, 360);

    expect(pointer('pointerdown', 12, 2, 360)).toBe(false);
    pointer('pointermove', 12, 2, 320);
    await nextTick();
    expect(pageElement.style.transform).not.toBe(middlePanTransform);
    pointer('pointerup', 12, 2, 320);

    const contextMenuEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    expect(canvasElement.dispatchEvent(contextMenuEvent)).toBe(false);
    expect(canvasElement.classList.contains('is-tool-pen')).toBe(true);
    expect(updates).toHaveLength(0);
    expect(canvasElement.setPointerCapture).toHaveBeenCalledTimes(2);
    expect(canvasElement.releasePointerCapture).toHaveBeenCalledTimes(2);
    app.unmount();
    host.remove();
    clientWidthSpy.mockRestore();
    clientHeightSpy.mockRestore();
  });

  it('P 与 V 切换画笔和选择工具，输入法组合与活动手势期间不误切换', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(DrawingNoteEditor, {
      content: JSON.stringify({ v: 2, page: { width: 1448, height: 1448 }, elements: [] }),
    });
    app.mount(host);
    await nextTick();
    const canvasElement = host.querySelector('canvas') as HTMLCanvasElement;
    const editorElement = host.querySelector('.drawing-editor') as HTMLElement;
    const penButton = host.querySelector('button[aria-label="note.drawingPen"]') as HTMLButtonElement;
    const textButton = host.querySelector('button[aria-label="note.drawingText"]') as HTMLButtonElement;
    const selectButton = host.querySelector('button[aria-label="note.drawingSelect"]') as HTMLButtonElement;
    Object.defineProperties(canvasElement, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, right: 1448, bottom: 1448, width: 1448, height: 1448 }),
      },
    });

    expect(penButton.getAttribute('aria-pressed')).toBe('true');
    expect(canvasElement.classList.contains('is-tool-pen')).toBe(true);

    expect(
      editorElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'v' })),
    ).toBe(false);
    await nextTick();
    expect(selectButton.getAttribute('aria-pressed')).toBe('true');
    expect(canvasElement.classList.contains('is-tool-select')).toBe(true);

    expect(
      editorElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'p' })),
    ).toBe(false);
    await nextTick();
    expect(penButton.getAttribute('aria-pressed')).toBe('true');

    editorElement.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'v', isComposing: true }),
    );
    await nextTick();
    expect(penButton.getAttribute('aria-pressed')).toBe('true');

    const pointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    Object.defineProperty(pointerDown, 'pointerId', { value: 13 });
    canvasElement.dispatchEvent(pointerDown);
    expect(
      editorElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'v' })),
    ).toBe(true);
    await nextTick();
    expect(penButton.getAttribute('aria-pressed')).toBe('true');

    const pointerUp = new MouseEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 100,
      clientY: 100,
    });
    Object.defineProperty(pointerUp, 'pointerId', { value: 13 });
    canvasElement.dispatchEvent(pointerUp);

    textButton.click();
    const textPointerDown = new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 200,
      clientY: 200,
    });
    Object.defineProperty(textPointerDown, 'pointerId', { value: 14 });
    canvasElement.dispatchEvent(textPointerDown);
    await nextTick();
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'p' }));
    await nextTick();
    expect(textButton.getAttribute('aria-pressed')).toBe('true');
    textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
    await nextTick();

    app.unmount();
    host.remove();
  });

  it('移动端可从整条工具栏横滑，并用边界按钮翻到更多工具', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(DrawingNoteEditor, {
      content: JSON.stringify({ v: 2, page: { width: 1448, height: 1448 }, elements: [] }),
    });
    app.provide(MOBILE_LAYOUT_CONTEXT, ref(true));
    app.mount(host);
    await nextTick();

    const toolbar = host.querySelector('.drawing-toolbar') as HTMLElement;
    const scroll = host.querySelector('.drawing-toolbar-scroll') as HTMLElement;
    Object.defineProperties(toolbar, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
    });
    Object.defineProperties(scroll, {
      clientWidth: { value: 180, configurable: true },
      scrollWidth: { value: 420, configurable: true },
    });
    scroll.dispatchEvent(new Event('scroll'));
    await nextTick();

    const moreButton = host.querySelector('button[aria-label="note.drawingToolbarMoreTools"]') as HTMLButtonElement;
    expect(moreButton).not.toBeNull();
    expect(moreButton.disabled).toBe(false);
    expect(moreButton.classList.contains('is-forward')).toBe(true);
    expect(scroll.clientWidth).toBe(180);
    expect(scroll.scrollWidth).toBe(420);
    const mobileZoom = scroll.querySelector('.drawing-toolbar-zoom-mobile') as HTMLElement;
    expect(mobileZoom).not.toBeNull();
    expect(mobileZoom.querySelectorAll('button')).toHaveLength(3);
    const history = host.querySelector('.drawing-toolbar-history') as HTMLElement;
    const styleButton = history.querySelector('button[aria-label="note.drawingStyle"]') as HTMLButtonElement;
    const eraserButton = scroll.querySelector('button[aria-label="note.drawingEraser"]') as HTMLButtonElement;
    const selectButton = scroll.querySelector('button[aria-label="note.drawingSelect"]') as HTMLButtonElement;
    const handButton = scroll.querySelector('button[aria-label="note.drawingHand"]') as HTMLButtonElement;
    expect(selectButton.compareDocumentPosition(handButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(handButton.compareDocumentPosition(mobileZoom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scroll.querySelector('button[aria-label="note.drawingStyle"]')).toBeNull();
    expect(styleButton.classList.contains('drawing-style-trigger-mobile')).toBe(true);
    expect(styleButton.querySelector('.drawing-color-dot')).not.toBeNull();
    expect(styleButton.querySelector('.drawing-style-size')?.textContent?.trim()).toBe('4');
    expect(styleButton.disabled).toBe(false);
    eraserButton.click();
    await nextTick();
    expect(styleButton.querySelector('.drawing-color-dot')).toBeNull();
    expect(styleButton.querySelector('.drawing-style-size')?.textContent?.trim()).toBe('18');
    expect(styleButton.disabled).toBe(false);
    handButton.click();
    await nextTick();
    expect(styleButton.disabled).toBe(true);
    expect(history.querySelector('button[aria-label="note.drawingStyle"]')).toBe(styleButton);
    moreButton.click();
    await nextTick();
    expect(scroll.scrollLeft).toBeGreaterThan(0);

    scroll.scrollLeft = 0;
    scroll.dispatchEvent(new Event('scroll'));
    const helpButton = host.querySelector('button[aria-label="note.drawingTouchHelp"]') as HTMLButtonElement;
    const pointer = (target: Element, type: string, pointerId: number, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY });
      Object.defineProperties(event, {
        pointerId: { value: pointerId },
        pointerType: { value: 'touch' },
      });
      target.dispatchEvent(event);
    };
    pointer(helpButton, 'pointerdown', 31, 150, 20);
    pointer(toolbar, 'pointermove', 31, 50, 22);
    pointer(toolbar, 'pointerup', 31, 50, 22);
    expect(scroll.scrollLeft).toBe(100);
    expect(toolbar.setPointerCapture).toHaveBeenCalledOnce();
    expect(toolbar.releasePointerCapture).toHaveBeenCalledOnce();

    app.unmount();
    host.remove();
  });

  it('移动端手形工具支持双指以手势中心缩放并继续单指平移', async () => {
    const updates: string[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(DrawingNoteEditor, {
      content: JSON.stringify({ v: 2, page: { width: 1448, height: 1448 }, elements: [] }),
      'onUpdate:content': (content: string) => updates.push(content),
    });
    app.provide(MOBILE_LAYOUT_CONTEXT, ref(true));
    app.mount(host);
    await nextTick();

    const workspace = host.querySelector('.drawing-workspace') as HTMLElement;
    const canvasElement = host.querySelector('canvas') as HTMLCanvasElement;
    const handButton = host.querySelector('button[aria-label="note.drawingHand"]') as HTMLButtonElement;
    Object.defineProperties(workspace, {
      clientWidth: { value: 375 },
      clientHeight: { value: 600 },
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, right: 375, bottom: 600, width: 375, height: 600 }),
      },
    });
    Object.defineProperties(canvasElement, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, right: 1448, bottom: 1448, width: 1448, height: 1448 }),
      },
    });

    const zoomInButton = host.querySelector('.drawing-toolbar-zoom button:last-child') as HTMLButtonElement;
    zoomInButton.click();
    handButton.click();
    const pointer = (type: string, pointerId: number, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY });
      Object.defineProperties(event, {
        pointerId: { value: pointerId },
        pointerType: { value: 'touch' },
      });
      canvasElement.dispatchEvent(event);
    };

    pointer('pointerdown', 41, 100, 180);
    pointer('pointerdown', 42, 200, 180);
    pointer('pointermove', 42, 300, 180);
    await nextTick();
    expect((host.querySelector('.drawing-mobile-zoom-value') as HTMLButtonElement).textContent?.trim()).toBe('60%');

    pointer('pointerup', 42, 300, 180);
    pointer('pointermove', 41, 120, 200);
    pointer('pointerup', 41, 120, 200);
    expect(canvasElement.releasePointerCapture).toHaveBeenCalledWith(42);
    expect(canvasElement.releasePointerCapture).toHaveBeenCalledWith(41);
    expect(updates).toHaveLength(0);

    app.unmount();
    host.remove();
  });

  it('文字工具提交后清除选择态，Delete 不会误删刚输入的文字', async () => {
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
    const textButton = host.querySelector('button[aria-label="note.drawingText"]') as HTMLButtonElement;
    Object.defineProperties(canvasElement, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, right: 1448, bottom: 1448, width: 1448, height: 1448 }),
      },
    });

    textButton.click();
    await nextTick();
    const pointerDown = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 240 });
    Object.defineProperty(pointerDown, 'pointerId', { value: 21 });
    canvasElement.dispatchEvent(pointerDown);
    await nextTick();
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = '测试文字';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await nextTick();

    expect(updates).toHaveLength(1);
    expect(JSON.parse(updates[0]).elements[0]).toMatchObject({ kind: 'text', text: '测试文字' });
    editorElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Delete' }));
    await nextTick();
    expect(updates).toHaveLength(1);
    app.unmount();
    host.remove();
  });

  it('文字输入按 Escape 取消草稿并关闭输入框，不提交本次内容', async () => {
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
    const textButton = host.querySelector('button[aria-label="note.drawingText"]') as HTMLButtonElement;
    Object.defineProperties(canvasElement, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, right: 1448, bottom: 1448, width: 1448, height: 1448 }),
      },
    });

    textButton.click();
    const pointerDown = new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 240 });
    Object.defineProperty(pointerDown, 'pointerId', { value: 22 });
    canvasElement.dispatchEvent(pointerDown);
    await nextTick();
    const textarea = host.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = '不应提交的文字';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' }));
    await nextTick();

    expect(host.querySelector('textarea')).toBeNull();
    expect(updates).toHaveLength(0);
    expect(document.activeElement).toBe(host.querySelector('.drawing-editor'));
    app.unmount();
    host.remove();
  });

  it('批量框选后可从组合包围框的空白处按住并拖动全部元素', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1496);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(1496);
    const updates: string[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(DrawingNoteEditor, {
      content: JSON.stringify({
        v: 2,
        page: { width: 1448, height: 1448 },
        elements: [
          { id: 'a', kind: 'stroke', color: '#1f2937', width: 4, points: [100, 100, 140, 140] },
          { id: 'b', kind: 'stroke', color: '#1f2937', width: 4, points: [300, 300, 340, 340] },
        ],
      }),
      'onUpdate:content': (content: string) => updates.push(content),
    });
    app.mount(host);
    await nextTick();
    const canvasElement = host.querySelector('canvas') as HTMLCanvasElement;
    const selectButton = host.querySelector('button[aria-label="note.drawingSelect"]') as HTMLButtonElement;
    Object.defineProperties(canvasElement, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, right: 1448, bottom: 1448, width: 1448, height: 1448 }),
      },
    });
    const pointer = (type: string, pointerId: number, clientX: number, clientY: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, clientY });
      Object.defineProperty(event, 'pointerId', { value: pointerId });
      canvasElement.dispatchEvent(event);
    };

    selectButton.click();
    await nextTick();
    pointer('pointerdown', 31, 60, 60);
    pointer('pointermove', 31, 380, 380);
    pointer('pointerup', 31, 380, 380);
    expect(updates).toHaveLength(0);

    pointer('pointerdown', 32, 220, 220);
    pointer('pointermove', 32, 270, 250);
    pointer('pointerup', 32, 270, 250);
    await nextTick();

    expect(updates).toHaveLength(1);
    const elements = JSON.parse(updates[0]).elements;
    expect(elements[0].points).toEqual([150, 130, 190, 170]);
    expect(elements[1].points).toEqual([350, 330, 390, 370]);
    app.unmount();
    host.remove();
  });

  it('形状工具创建正式元素，Shift 约束角度并可通过选择端点缩放', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1496);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(1496);
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
    const shapeButton = host.querySelector('button[aria-label^="note.drawingShape"]') as HTMLButtonElement;
    const selectButton = host.querySelector('button[aria-label="note.drawingSelect"]') as HTMLButtonElement;
    const editorElement = host.querySelector('.drawing-editor') as HTMLElement;
    const historyGroup = host.querySelector('.drawing-toolbar-history') as HTMLElement;
    expect(historyGroup.querySelector('button[aria-label="note.drawingUndo"]')).toBeTruthy();
    expect(historyGroup.querySelector('button[aria-label="note.drawingRedo"]')).toBeTruthy();
    expect(historyGroup.querySelector('button[aria-label="note.drawingHelp"]')).toBeTruthy();
    expect(host.querySelector('.drawing-toolbar-scroll button[aria-label="note.drawingStyle"]')).toBeTruthy();
    Object.defineProperties(canvasElement, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, right: 1448, bottom: 1448, width: 1448, height: 1448 }),
      },
    });
    const pointer = (type: string, pointerId: number, clientX: number, clientY: number, shiftKey = false) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX,
        clientY,
        shiftKey,
      });
      Object.defineProperty(event, 'pointerId', { value: pointerId });
      canvasElement.dispatchEvent(event);
    };

    shapeButton.click();
    pointer('pointerdown', 41, 100, 100);
    pointer('pointermove', 41, 200, 128, true);
    pointer('pointerup', 41, 200, 128, true);
    await nextTick();

    expect(updates).toHaveLength(1);
    const created = JSON.parse(updates[0]).elements[0];
    expect(created).toMatchObject({ kind: 'shape', shape: 'line', x: 100, y: 100, strokeWidth: 4 });
    expect(created.height).toBeCloseTo(0, 5);

    selectButton.click();
    pointer('pointerdown', 42, created.x + created.width / 2, created.y + created.height / 2);
    pointer('pointerup', 42, created.x + created.width / 2, created.y + created.height / 2);
    const endX = created.x + created.width;
    const endY = created.y + created.height;
    pointer('pointerdown', 43, endX, endY);
    pointer('pointermove', 43, endX + 60, endY + 80);
    pointer('pointerup', 43, endX + 60, endY + 80);
    await nextTick();

    expect(updates).toHaveLength(2);
    const resized = JSON.parse(updates[1]).elements[0];
    expect(resized.width).toBeCloseTo(created.width + 60, 2);
    expect(resized.height).toBeCloseTo(80, 2);

    editorElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'z', metaKey: true }));
    await nextTick();
    expect(JSON.parse(updates[2]).elements[0]).toEqual(created);
    app.unmount();
    host.remove();
  });

  it('滚轮以鼠标位置为锚点连续缩放，横向滚动用于平移', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(848);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(648);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(DrawingNoteEditor, {
      content: JSON.stringify({ v: 2, page: { width: 1448, height: 1448 }, elements: [] }),
    });
    app.mount(host);
    await nextTick();
    const workspaceElement = host.querySelector('.drawing-workspace') as HTMLElement;
    const pageElement = host.querySelector('.drawing-page') as HTMLElement;
    vi.spyOn(workspaceElement, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 848,
      bottom: 648,
      width: 848,
      height: 648,
    } as DOMRect);
    const cameraX = () => Number(pageElement.style.transform.match(/translate3d\(([-\d.]+)px/u)?.[1] || 0);
    const initialZoom = Number.parseFloat(pageElement.style.width) / 1448;
    const initialCameraX = cameraX();
    const pointerClientX = 224;
    const anchorX = pointerClientX - (Number.parseFloat(getComputedStyle(workspaceElement).paddingLeft) || 0);
    const logicalAnchorX = (anchorX - initialCameraX) / initialZoom;

    const zoomEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: pointerClientX,
      clientY: 224,
      deltaY: -120,
    });
    expect(workspaceElement.dispatchEvent(zoomEvent)).toBe(false);
    await nextTick();
    const zoomed = Number.parseFloat(pageElement.style.width) / 1448;
    const zoomedCameraX = cameraX();
    expect(zoomed).toBeGreaterThan(initialZoom);
    expect(zoomedCameraX + logicalAnchorX * zoomed).toBeCloseTo(anchorX, 4);

    const horizontalEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: pointerClientX,
      clientY: 224,
      deltaX: 80,
    });
    expect(workspaceElement.dispatchEvent(horizontalEvent)).toBe(false);
    await nextTick();
    const horizontalCameraX = cameraX();
    expect(horizontalCameraX).toBeLessThan(zoomedCameraX);

    const shiftHorizontalEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: pointerClientX,
      clientY: 224,
      deltaY: 80,
      shiftKey: true,
    });
    expect(workspaceElement.dispatchEvent(shiftHorizontalEvent)).toBe(false);
    await nextTick();
    expect(cameraX()).toBeLessThan(horizontalCameraX);
    app.unmount();
    host.remove();
  });

  it('缩放按钮可达到 200% 并在上限停止', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(848);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(648);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(DrawingNoteEditor, {
      content: JSON.stringify({ v: 2, page: { width: 1448, height: 1448 }, elements: [] }),
    });
    app.mount(host);
    await nextTick();

    const zoomInButton = host.querySelector('.drawing-toolbar-zoom button:last-child') as HTMLButtonElement;
    for (let index = 0; index < 8; index += 1) zoomInButton.click();
    await nextTick();

    expect(host.querySelector('.drawing-zoom-label')?.textContent?.trim()).toBe('200%');
    expect(zoomInButton.disabled).toBe(true);

    app.unmount();
    host.remove();
  });

  it('橡皮点击粗笔画后提交 V3 笔画遮罩而不是拆分中心线', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1496);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(1496);
    const updates: string[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(DrawingNoteEditor, {
      content: JSON.stringify({
        v: 2,
        page: { width: 1448, height: 1448 },
        elements: [{ id: 'thick', kind: 'stroke', color: '#1f2937', width: 20, points: [100, 200, 500, 200] }],
      }),
      'onUpdate:content': (content: string) => updates.push(content),
    });
    app.mount(host);
    await nextTick();
    const canvasElement = host.querySelector('canvas') as HTMLCanvasElement;
    const eraserButton = host.querySelector('button[aria-label="note.drawingEraser"]') as HTMLButtonElement;
    Object.defineProperties(canvasElement, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, right: 1448, bottom: 1448, width: 1448, height: 1448 }),
      },
    });
    eraserButton.click();
    const pointer = (type: string) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 300, clientY: 200 });
      Object.defineProperty(event, 'pointerId', { value: 71 });
      canvasElement.dispatchEvent(event);
    };
    pointer('pointerdown');
    pointer('pointerup');
    await nextTick();

    expect(updates).toHaveLength(1);
    const saved = JSON.parse(updates[0]);
    expect(saved.v).toBe(3);
    expect(saved.elements).toHaveLength(1);
    expect(saved.elements[0]).toMatchObject({
      id: 'thick',
      points: [100, 200, 500, 200],
      erasures: [{ width: 18, points: [300, 200] }],
    });
    app.unmount();
    host.remove();
  });

  it('橡皮点击形状轮廓后提交 V3 形状遮罩', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1496);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(1496);
    const updates: string[] = [];
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(DrawingNoteEditor, {
      content: JSON.stringify({
        v: 2,
        page: { width: 1448, height: 1448 },
        elements: [
          {
            id: 'rectangle',
            kind: 'shape',
            shape: 'rectangle',
            x: 100,
            y: 200,
            width: 400,
            height: 300,
            color: '#1f2937',
            strokeWidth: 20,
          },
        ],
      }),
      'onUpdate:content': (content: string) => updates.push(content),
    });
    app.mount(host);
    await nextTick();
    const canvasElement = host.querySelector('canvas') as HTMLCanvasElement;
    const eraserButton = host.querySelector('button[aria-label="note.drawingEraser"]') as HTMLButtonElement;
    Object.defineProperties(canvasElement, {
      setPointerCapture: { value: vi.fn() },
      releasePointerCapture: { value: vi.fn() },
      getBoundingClientRect: {
        value: () => ({ left: 0, top: 0, right: 1448, bottom: 1448, width: 1448, height: 1448 }),
      },
    });
    eraserButton.click();
    const pointer = (type: string) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 300, clientY: 200 });
      Object.defineProperty(event, 'pointerId', { value: 72 });
      canvasElement.dispatchEvent(event);
    };
    pointer('pointerdown');
    pointer('pointerup');
    await nextTick();

    expect(updates).toHaveLength(1);
    expect(JSON.parse(updates[0])).toMatchObject({
      v: 3,
      elements: [
        {
          id: 'rectangle',
          kind: 'shape',
          erasures: [{ width: 18, points: [300, 200] }],
        },
      ],
    });
    app.unmount();
    host.remove();
  });

  it('只读画板不拦截滚轮，保留页面原生滚动', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(DrawingNoteEditor, {
      readonly: true,
      content: JSON.stringify({ v: 2, page: { width: 1448, height: 1448 }, elements: [] }),
    });
    app.mount(host);
    await nextTick();
    const workspaceElement = host.querySelector('.drawing-workspace') as HTMLElement;
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 200,
      deltaY: 120,
    });

    expect(workspaceElement.dispatchEvent(wheelEvent)).toBe(true);
    app.unmount();
    host.remove();
  });
});
