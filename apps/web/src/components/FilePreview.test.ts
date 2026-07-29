import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import FilePreview from './FilePreview.vue';
import { HTML_PREVIEW_REFERRER_POLICY, HTML_PREVIEW_SANDBOX } from '@/utils/htmlPreview';

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

describe('FilePreview HTML sandbox', () => {
  it('loads HTML directly in an isolated iframe instead of injecting it into the app DOM', async () => {
    const { fileUrl } = await mountHtmlPreview();
    const iframe = document.body.querySelector<HTMLIFrameElement>('iframe.html-preview-iframe');

    expect(iframe).not.toBeNull();
    expect(fetch).toHaveBeenCalledWith(fileUrl, { mode: 'cors' });
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect((createObjectUrl.mock.calls[0][0] as Blob).type).toBe('text/html;charset=utf-8');
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
  it('loads the signed URL as a blob so the browser keeps the PDF in the preview frame', async () => {
    const { fileUrl } = await mountPdfPreview();
    const iframe = document.body.querySelector<HTMLIFrameElement>('iframe.preview-iframe');

    expect(fetch).toHaveBeenCalledWith(fileUrl, { mode: 'cors' });
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(iframe?.getAttribute('src')).toBe('blob:https://boluo66.top/html-preview');

    cleanup?.();
    cleanup = undefined;
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:https://boluo66.top/html-preview');
  });
});
