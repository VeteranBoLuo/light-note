import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import FilePreview from './FilePreview.vue';
import { HTML_PREVIEW_REFERRER_POLICY, HTML_PREVIEW_SANDBOX } from '@/utils/htmlPreview';
import { MOBILE_OVERLAY_HISTORY_STATE_KEY, resetMobileOverlayHistoryForTests } from '@/utils/mobileOverlayHistory';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/base/VideoPreview.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('@/components/base/BasicComponents/BTooltip.vue', () => ({
  default: { template: '<span><slot /></span>' },
}));

vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { template: '<button><slot /></button>' },
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span />' },
}));

vi.mock('@/components/noteLibrary/detail/ResourceBacklinks.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('@/components/cloudSpace/PdfPreview.vue', () => ({
  default: {
    props: ['src', 'fileName'],
    template: '<div class="pdf-preview-stub" :data-src="src" :data-file-name="fileName" />',
  },
}));

vi.mock('@/api/commonApi.ts', () => ({
  recordOperation: vi.fn(),
}));

vi.mock('@/utils/topLayerEscape', () => ({
  acquireTopLayerEscapeLock: () => () => undefined,
}));

let cleanup: (() => void) | undefined;
let originalCreateObjectUrl: PropertyDescriptor | undefined;
let originalRevokeObjectUrl: PropertyDescriptor | undefined;
let originalFullscreenElement: PropertyDescriptor | undefined;
let originalExitFullscreen: PropertyDescriptor | undefined;
const createObjectUrl = vi.fn(() => 'blob:https://boluo66.top/html-preview');
const revokeObjectUrl = vi.fn();

beforeEach(() => {
  resetMobileOverlayHistoryForTests();
  window.history.replaceState({}, '', '/');
  vi.spyOn(window.history, 'back').mockImplementation(() => {});
  originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
  originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
  originalFullscreenElement = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
  originalExitFullscreen = Object.getOwnPropertyDescriptor(document, 'exitFullscreen');
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
  createObjectUrl.mockClear();
  revokeObjectUrl.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['<script>window.started = true</script>'], { type: 'application/octet-stream' }),
    })),
  );
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  if (originalCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
  else delete (URL as Partial<typeof URL>).createObjectURL;
  if (originalRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
  else delete (URL as Partial<typeof URL>).revokeObjectURL;
  if (originalFullscreenElement) Object.defineProperty(document, 'fullscreenElement', originalFullscreenElement);
  else delete (document as Partial<Document>).fullscreenElement;
  if (originalExitFullscreen) Object.defineProperty(document, 'exitFullscreen', originalExitFullscreen);
  else delete (document as Partial<Document>).exitFullscreen;
  vi.unstubAllGlobals();
  resetMobileOverlayHistoryForTests();
  vi.restoreAllMocks();
});

async function mountHtmlPreview() {
  const host = document.createElement('div');
  document.body.append(host);
  const fileUrl = 'https://files.example/interactive.html?signature=test';
  const app = createApp({
    setup() {
      return () =>
        h(FilePreview, {
          visible: true,
          showNext: true,
          fileInfo: {
            id: 'html-1',
            fileName: 'interactive.html',
            fileType: 'text/html',
            fileUrl,
            category: 'text',
          },
        });
    },
  });
  app.mount(host);
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();

  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { fileUrl };
}

async function mountPdfPreview() {
  const host = document.createElement('div');
  document.body.append(host);
  const fileUrl = 'https://files.example/preview.pdf?signature=test';
  const app = createApp({
    setup() {
      return () =>
        h(FilePreview, {
          visible: true,
          showNext: true,
          fileInfo: {
            id: 'pdf-1',
            fileName: 'preview.pdf',
            fileType: 'application/pdf',
            fileUrl,
            category: 'pdf',
          },
        });
    },
  });
  app.mount(host);
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();

  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { fileUrl };
}

async function mountImagePreview() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(FilePreview, {
          visible: true,
          fileInfo: {
            id: 'image-1',
            fileName: 'preview.png',
            fileType: 'image/png',
            fileUrl: 'https://files.example/preview.png?signature=test',
            category: 'image',
          },
        });
    },
  });
  app.mount(host);
  await nextTick();

  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return document.body.querySelector<HTMLImageElement>('.preview-image')!;
}

async function mountUnsupportedPreview() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(FilePreview, {
          visible: true,
          showNext: true,
          fileInfo: {
            id: 'archive-1',
            fileName: 'archive.zip',
            fileType: 'application/zip',
            fileUrl: 'https://files.example/archive.zip?signature=test',
            category: 'compress',
          },
        });
    },
  });
  app.mount(host);
  await nextTick();

  cleanup = () => {
    app.unmount();
    host.remove();
  };
}

function dispatchTouch(
  image: HTMLImageElement,
  type: 'touchstart' | 'touchmove' | 'touchend',
  touches: Array<{ clientX: number; clientY: number }>,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  // jsdom 没有原生 TouchList；组件通过下标访问 TouchList，这里补齐同样的形状，
  // 避免测试夹具和真实移动端事件的行为不一致。
  const touchList = Object.assign(
    {
      0: touches[0],
      1: touches[1],
      length: touches.length,
    },
    {
      item(index: number) {
        return touches[index] ?? null;
      },
    },
  ) as unknown as TouchList;
  Object.defineProperty(event, 'touches', { configurable: true, value: touchList });
  Object.defineProperty(event, 'changedTouches', { configurable: true, value: touchList });
  image.dispatchEvent(event);
  return event;
}

describe('FilePreview HTML sandbox', () => {
  it('loads HTML directly in an isolated iframe instead of injecting it into the app DOM', async () => {
    const { fileUrl } = await mountHtmlPreview();
    const iframe = document.body.querySelector<HTMLIFrameElement>('iframe.html-preview-iframe');

    expect(iframe).not.toBeNull();
    expect(fetch).toHaveBeenCalledWith(fileUrl, { mode: 'cors' });
    expect(createObjectUrl).toHaveBeenCalledOnce();
    const htmlBlob = createObjectUrl.mock.calls[0][0] as Blob;
    const htmlSource = await htmlBlob.text();
    expect(htmlBlob.type).toBe('text/html;charset=utf-8');
    expect(htmlSource).toContain('data-light-note-anchor-bridge');
    expect(htmlSource).toContain('<script>window.started = true</script>');
    expect(iframe?.getAttribute('src')).toBe('blob:https://boluo66.top/html-preview');
    expect(iframe?.getAttribute('sandbox')).toBe(HTML_PREVIEW_SANDBOX);
    expect(iframe?.getAttribute('referrerpolicy')).toBe(HTML_PREVIEW_REFERRER_POLICY);
    expect(iframe?.getAttribute('allow')).toBe('fullscreen');
    expect(document.body.querySelector('.html-container')).toBeNull();

    cleanup?.();
    cleanup = undefined;
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:https://boluo66.top/html-preview');
  });

  it('keeps the normal controls until fullscreen, then exits with the top-right action', async () => {
    await mountHtmlPreview();
    const iframe = document.body.querySelector<HTMLIFrameElement>('iframe.html-preview-iframe');
    iframe?.dispatchEvent(new Event('load'));
    await nextTick();

    const previewRoot = document.body.querySelector<HTMLElement>('.fullscreen-preview');
    expect(previewRoot).not.toBeNull();
    expect(document.body.querySelector('.preview-controls')).not.toBeNull();

    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    const requestFullscreen = vi.fn(async () => {
      fullscreenElement = previewRoot;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    const exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    Object.defineProperty(previewRoot, 'requestFullscreen', { configurable: true, value: requestFullscreen });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });

    document.body.querySelector<HTMLButtonElement>('.header-fullscreen-btn')?.click();
    await nextTick();

    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(previewRoot?.classList.contains('html-fullscreen-mode')).toBe(true);
    expect(document.body.querySelector('.preview-controls')).toBeNull();
    expect(document.body.querySelector('.fullscreen-exit-bar')).not.toBeNull();
    expect(document.body.querySelector('.exit-fullscreen-btn')).not.toBeNull();

    document.body.querySelector<HTMLButtonElement>('.exit-fullscreen-btn')?.click();
    await nextTick();

    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(previewRoot?.classList.contains('html-fullscreen-mode')).toBe(false);
    expect(document.body.querySelector('.preview-controls')).not.toBeNull();
  });

  it('uses Escape to exit HTML fullscreen before closing the preview', async () => {
    await mountHtmlPreview();
    const iframe = document.body.querySelector<HTMLIFrameElement>('iframe.html-preview-iframe');
    iframe?.dispatchEvent(new Event('load'));
    await nextTick();

    const previewRoot = document.body.querySelector<HTMLElement>('.fullscreen-preview');
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(previewRoot, 'requestFullscreen', {
      configurable: true,
      value: vi.fn(async () => {
        fullscreenElement = previewRoot;
        document.dispatchEvent(new Event('fullscreenchange'));
      }),
    });
    const exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen });

    document.body.querySelector<HTMLButtonElement>('.header-fullscreen-btn')?.click();
    await nextTick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();

    expect(exitFullscreen).toHaveBeenCalledOnce();
    expect(previewRoot?.classList.contains('html-fullscreen-mode')).toBe(false);
    expect(previewRoot?.isConnected).toBe(true);
  });
});

describe('FilePreview PDF preview', () => {
  it('passes the signed URL to the local PDF renderer instead of relying on an iframe plugin', async () => {
    const { fileUrl } = await mountPdfPreview();
    const preview = document.body.querySelector<HTMLElement>('.pdf-preview-stub');

    expect(preview?.dataset.src).toBe(fileUrl);
    expect(preview?.dataset.fileName).toBe('preview.pdf');
    expect(document.body.querySelector('iframe.preview-iframe')).toBeNull();
  });
});

describe('FilePreview unified bottom controls', () => {
  it('keeps navigation and download in the bottom bar for unsupported files', async () => {
    await mountUnsupportedPreview();

    const controls = document.body.querySelector('.preview-controls');
    expect(controls).not.toBeNull();
    expect(controls?.querySelectorAll('button')).toHaveLength(3);
    expect(document.body.querySelector('.unsupported-preview button')).toBeNull();
  });
});

describe('FilePreview text request lifecycle', () => {
  it('does not let an older slow response overwrite the newly selected file', async () => {
    let resolveFirstResponse: ((value: unknown) => void) | undefined;
    const firstResponse = new Promise((resolve) => {
      resolveFirstResponse = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce({ ok: true, body: null, text: async () => 'new file content' });
    vi.stubGlobal('fetch', fetchMock);

    const host = document.createElement('div');
    document.body.append(host);
    const fileInfo = ref({
      id: 'text-1',
      fileName: 'first.txt',
      fileType: 'text/plain',
      fileUrl: 'https://files.example/first.txt?signature=test',
      category: 'text',
    });
    const app = createApp({
      setup() {
        return () => h(FilePreview, { visible: true, fileInfo: fileInfo.value });
      },
    });
    app.mount(host);
    await nextTick();
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    fileInfo.value = {
      ...fileInfo.value,
      id: 'text-2',
      fileName: 'second.txt',
      fileUrl: 'https://files.example/second.txt?signature=test',
    };
    await vi.waitFor(() =>
      expect(document.body.querySelector('.preview-text')?.textContent).toContain('new file content'),
    );

    resolveFirstResponse?.({ ok: true, body: null, text: async () => 'old file content' });
    await Promise.resolve();
    await nextTick();

    expect(document.body.querySelector('.preview-text')?.textContent).toContain('new file content');
    expect(document.body.querySelector('.preview-text')?.textContent).not.toContain('old file content');
  });
});

describe('FilePreview mobile image gestures', () => {
  it('uses the shared mobile overlay history marker so Android back closes the preview first', async () => {
    await mountImagePreview();

    expect(window.history.state[MOBILE_OVERLAY_HISTORY_STATE_KEY]).toMatch(/^overlay-/);
  });

  it('supports pinch zoom and pans the enlarged image with one finger', async () => {
    const image = await mountImagePreview();

    const pinchStart = dispatchTouch(image, 'touchstart', [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ]);
    const pinchMove = dispatchTouch(image, 'touchmove', [
      { clientX: 80, clientY: 100 },
      { clientX: 220, clientY: 100 },
    ]);
    await nextTick();

    expect(pinchStart.defaultPrevented).toBe(true);
    expect(pinchMove.defaultPrevented).toBe(true);
    expect(image.getAttribute('style')).toContain('scale(1.4)');

    dispatchTouch(image, 'touchend', [{ clientX: 150, clientY: 150 }]);
    dispatchTouch(image, 'touchmove', [{ clientX: 180, clientY: 190 }]);
    await nextTick();

    expect(image.getAttribute('style')).toContain('translate(30px, 40px)');
  });

  it('resets image transform when switching to another file', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const fileInfo = ref({
      id: 'image-1',
      fileName: 'first.png',
      fileType: 'image/png',
      fileUrl: 'https://files.example/first.png?signature=test',
      category: 'image',
    });
    const app = createApp({
      setup() {
        return () => h(FilePreview, { visible: true, fileInfo: fileInfo.value });
      },
    });
    app.mount(host);
    await nextTick();
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    const firstImage = document.body.querySelector<HTMLImageElement>('.preview-image')!;
    dispatchTouch(firstImage, 'touchstart', [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 100 },
    ]);
    dispatchTouch(firstImage, 'touchmove', [
      { clientX: 80, clientY: 100 },
      { clientX: 220, clientY: 100 },
    ]);
    await nextTick();
    expect(firstImage.getAttribute('style')).toContain('scale(1.4)');

    fileInfo.value = {
      ...fileInfo.value,
      id: 'image-2',
      fileName: 'second.png',
      fileUrl: 'https://files.example/second.png?signature=test',
    };
    await nextTick();

    const secondImage = document.body.querySelector<HTMLImageElement>('.preview-image')!;
    expect(secondImage.getAttribute('style')).toContain('translate(0px, 0px) scale(1) rotate(0deg)');
  });
});
