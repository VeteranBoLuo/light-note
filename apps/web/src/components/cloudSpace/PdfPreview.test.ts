import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PdfPreview from './PdfPreview.vue';
import zhCN from '@/i18n/locales/zh-CN';

const navigatorSource = readFileSync(resolve(process.cwd(), 'src/components/cloudSpace/PdfPageNavigator.vue'), 'utf8');

const pdfMocks = vi.hoisted(() => ({
  workerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));

vi.mock('pdfjs-dist/legacy/build/pdf.js', () => ({
  GlobalWorkerOptions: pdfMocks.workerOptions,
  getDocument: pdfMocks.getDocument,
}));

vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.js?url', () => ({
  default: '/assets/pdf.worker.js',
}));

class ImmediateIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element) {
    this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this);
  }

  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

class PassiveResizeObserver implements ResizeObserver {
  constructor(_callback: ResizeObserverCallback) {}
  observe() {}
  disconnect() {}
  unobserve() {}
}

let cleanup: (() => void) | undefined;

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
  pdfMocks.workerOptions.workerSrc = '';
  pdfMocks.getDocument.mockReset();
  vi.stubGlobal('IntersectionObserver', ImmediateIntersectionObserver);
  vi.stubGlobal('ResizeObserver', PassiveResizeObserver);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PdfPreview', () => {
  it('downloads the signed PDF and renders its first page to a canvas', async () => {
    const render = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
    const cleanupPage = vi.fn();
    const getPage = vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
      render,
      cleanup: cleanupPage,
    }));
    const destroyDocument = vi.fn(async () => undefined);
    const documentProxy = { numPages: 3, getPage, destroy: destroyDocument };
    const destroyLoadingTask = vi.fn(async () => undefined);
    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.resolve(documentProxy),
      destroy: destroyLoadingTask,
    });

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => pdfBytes }));
    vi.stubGlobal('fetch', fetchMock);
    const drawImage = vi.fn();
    const renderContext = {} as CanvasRenderingContext2D;
    const visibleContext = { drawImage } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
      return this.isConnected ? visibleContext : renderContext;
    });

    const host = document.createElement('div');
    document.body.append(host);
    let renderedCount = 0;
    const app = createApp({
      setup() {
        return () =>
          h(PdfPreview, {
            src: 'https://files.example/report.pdf?signature=test',
            fileName: 'report.pdf',
            onRendered: () => {
              renderedCount += 1;
            },
          });
      },
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    await vi.waitFor(() => expect(renderedCount).toBe(1));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://files.example/report.pdf?signature=test',
      expect.objectContaining({ mode: 'cors', signal: expect.any(AbortSignal) }),
    );
    expect(pdfMocks.workerOptions.workerSrc).toBe('/assets/pdf.worker.js');
    expect(pdfMocks.getDocument).toHaveBeenCalledWith({
      data: expect.any(Uint8Array),
      isEvalSupported: false,
    });
    expect(getPage).toHaveBeenCalledWith(1);
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        canvasContext: renderContext,
        background: '#ffffff',
      }),
    );
    expect(drawImage).toHaveBeenCalled();
    expect(host.querySelector('.pdf-preview__page')?.getAttribute('data-rendered')).toBe('true');
    expect(host.querySelectorAll('.pdf-preview__page')).toHaveLength(3);
    expect(host.querySelector('.pdf-preview__pages')?.classList.contains('is-single')).toBe(true);
    expect(host.querySelector('.pdf-preview__sidebar')).not.toBeNull();
    const navigatorTabs = host.querySelectorAll('.pdf-preview__sidebar .pdf-navigator__tabs [role="tab"]');
    expect(navigatorTabs).toHaveLength(2);
    expect(Array.from(navigatorTabs).every((tab) => tab.classList.contains('tab'))).toBe(true);
    expect(navigatorSource).toMatch(/\.pdf-navigator__tabs \.tab[\s\S]*?flex:\s*1 1 50%/);
    expect(host.querySelector('[aria-label="连续滚动"]')).toBeNull();
    expect(host.querySelector('[aria-label="适合页面"]')?.classList.contains('is-active')).toBe(true);
    expect(host.querySelector('[aria-label="适合宽度"]')?.classList.contains('is-active')).toBe(false);

    const zoomInButton = host.querySelector<HTMLButtonElement>('[aria-label="放大（Ctrl + 滚轮）"]');
    zoomInButton?.click();
    await vi.waitFor(() => expect(host.textContent).toContain('120%'));

    const singlePageButton = host.querySelector<HTMLButtonElement>('[aria-label="单页视图"]');
    singlePageButton?.click();
    await vi.waitFor(() => expect(host.querySelectorAll('.pdf-preview__page')).toHaveLength(3));

    const firstCanvas = host.querySelector<HTMLCanvasElement>('.pdf-preview__canvas');
    const canvasWidthBeforeModeChange = firstCanvas?.width;
    host.querySelector<HTMLButtonElement>('[aria-label="双页视图"]')?.click();
    expect(firstCanvas?.width).toBe(canvasWidthBeforeModeChange);
    expect(firstCanvas?.width).not.toBe(1);
    await vi.waitFor(() => {
      const pageNumbers = Array.from(host.querySelectorAll<HTMLElement>('.pdf-preview__page')).map((page) =>
        page.getAttribute('data-page-number'),
      );
      expect(pageNumbers).toEqual(['1', '2', '3']);
      expect(host.querySelector('.pdf-preview__pages')?.classList.contains('is-spread')).toBe(true);
    });

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    window.dispatchEvent(new Event('resize'));
    await vi.waitFor(() => {
      expect(host.querySelector('[aria-label="适合页面"]')).toBeNull();
      expect(host.querySelector('[aria-label="适合宽度"]')).toBeNull();
      expect(host.querySelector('[aria-label="单页视图"]')).toBeNull();
      expect(host.querySelector('.pdf-preview__view-controls')).toBeNull();
      expect(host.querySelector('[aria-label="顺时针旋转"]')).not.toBeNull();
    });

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 820 });
    window.dispatchEvent(new Event('resize'));
    await vi.waitFor(() => {
      expect(host.querySelector('[aria-label="适合页面"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="适合宽度"]')).not.toBeNull();
      expect(host.querySelector('[aria-label="单页视图"]')).not.toBeNull();
    });
  });
});
