import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import PdfPreview from './PdfPreview.vue';
import zhCN from '@/i18n/locales/zh-CN';
import { MOBILE_LAYOUT_CONTEXT } from '@/composables/useMobileLayout';

const pdfMocks = vi.hoisted(() => {
  const textLayers: { cancel: () => void; container: HTMLElement }[] = [];
  const state = { lines: ['记录时把受访者的原话和研', '究者的解读分开写。'] };
  class FakeTextLayer {
    textDivs: HTMLElement[] = [];
    container: HTMLElement;
    cancel = vi.fn();
    constructor({ container }: { container: HTMLElement }) {
      this.container = container;
      textLayers.push(this);
    }
    async render() {
      for (const line of state.lines) {
        const span = document.createElement('span');
        span.textContent = line;
        this.container.append(span, document.createElement('br'));
        this.textDivs.push(span);
      }
    }
  }
  return { workerOptions: { workerSrc: '' }, getDocument: vi.fn(), TextLayer: FakeTextLayer, textLayers, state };
});

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: pdfMocks.workerOptions,
  getDocument: pdfMocks.getDocument,
  TextLayer: pdfMocks.TextLayer,
}));

vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker&url', () => ({ default: '/assets/pdf.worker.js' }));

const clipboardMocks = vi.hoisted(() => ({ copyTextToClipboard: vi.fn(async () => true) }));
vi.mock('@/utils/clipboard', () => clipboardMocks);

class ImmediateIntersectionObserver {
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

class PassiveResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

let cleanup: (() => void) | undefined;

beforeEach(() => {
  pdfMocks.textLayers.length = 0;
  pdfMocks.state.lines = ['记录时把受访者的原话和研', '究者的解读分开写。'];
  pdfMocks.getDocument.mockReset();
  clipboardMocks.copyTextToClipboard.mockClear();
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
  vi.stubGlobal('ResizeObserver', PassiveResizeObserver);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
  );
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale, scale }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    streamTextContent: vi.fn(() => ({})),
    cleanup: vi.fn(),
  };
  pdfMocks.getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 1, getPage: vi.fn(async () => page), destroy: vi.fn(async () => undefined) }),
    destroy: vi.fn(async () => undefined),
  });
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  window.getSelection()?.removeAllRanges();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mountPreview(mobile = true) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ setup: () => () => h(PdfPreview, { src: 'https://files.example/a.pdf', fileName: 'a.pdf' }) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.provide(MOBILE_LAYOUT_CONTEXT, ref(mobile));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

function selectTextLayer(host: HTMLElement) {
  const spans = host.querySelectorAll('.pdf-preview__text-layer span');
  const range = document.createRange();
  range.setStart(spans[0].firstChild!, 0);
  range.setEnd(spans[spans.length - 1].firstChild!, spans[spans.length - 1].textContent!.length);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
}

describe('PdfPreview 文字层与摘录', () => {
  it('页面画完后生成文字层：带缩放比例，末尾补 endOfContent', async () => {
    const host = mountPreview();
    await vi.waitFor(() => expect(host.querySelectorAll('.pdf-preview__text-layer span')).toHaveLength(2));
    const layer = host.querySelector<HTMLElement>('.pdf-preview__text-layer')!;
    expect(layer.style.getPropertyValue('--scale-factor')).not.toBe('');
    await vi.waitFor(() => expect(layer.querySelector('.endOfContent')).not.toBeNull());
  });

  it('选中文字后出现摘录条；复制得到合并了硬折行的正文', async () => {
    const host = mountPreview();
    await vi.waitFor(() => expect(host.querySelectorAll('.pdf-preview__text-layer span')).toHaveLength(2));
    selectTextLayer(host);
    await vi.waitFor(() => expect(host.querySelector('.pdf-excerpt-bar')).not.toBeNull());
    // 没有宿主提供插入或摘录能力时只能复制。
    expect(host.querySelector('.pdf-excerpt-bar')?.textContent).toContain('复制');
    expect(host.querySelector('.pdf-excerpt-bar')?.textContent).not.toContain('插入笔记');

    const setData = vi.fn();
    const copyEvent = new Event('copy', { cancelable: true });
    Object.defineProperty(copyEvent, 'clipboardData', { value: { setData } });
    document.dispatchEvent(copyEvent);
    expect(setData).toHaveBeenCalledWith('text/plain', '记录时把受访者的原话和研究者的解读分开写。');
    expect(copyEvent.defaultPrevented).toBe(true);

    host.querySelector<HTMLButtonElement>('.pdf-excerpt-bar button')?.click();
    await vi.waitFor(() => expect(host.querySelector('.pdf-excerpt-bar')?.textContent).toContain('已复制'));
    expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledWith('记录时把受访者的原话和研究者的解读分开写。');
  });

  it('选区不在文字层里时不拦截复制', async () => {
    const host = mountPreview();
    await vi.waitFor(() => expect(host.querySelectorAll('.pdf-preview__text-layer span')).toHaveLength(2));
    const outside = document.createElement('p');
    outside.textContent = '页面其它文字';
    document.body.append(outside);
    const range = document.createRange();
    range.selectNodeContents(outside);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    const setData = vi.fn();
    const copyEvent = new Event('copy', { cancelable: true });
    Object.defineProperty(copyEvent, 'clipboardData', { value: { setData } });
    document.dispatchEvent(copyEvent);
    expect(setData).not.toHaveBeenCalled();
    expect(copyEvent.defaultPrevented).toBe(false);
    outside.remove();
  });
});
