import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import PdfPreview from './PdfPreview.vue';

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
    this.callback(
      [{ target, isIntersecting: true } as IntersectionObserverEntry],
      this,
    );
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
    const documentProxy = { numPages: 1, getPage, destroy: destroyDocument };
    const destroyLoadingTask = vi.fn(async () => undefined);
    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.resolve(documentProxy),
      destroy: destroyLoadingTask,
    });

    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => pdfBytes }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);

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
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    await vi.waitFor(() => expect(render).toHaveBeenCalledOnce());
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
        canvasContext: expect.any(Object),
        background: '#ffffff',
      }),
    );
    expect(host.querySelector('.pdf-preview__page')?.getAttribute('data-rendered')).toBe('true');
  });
});
