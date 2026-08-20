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
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
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
