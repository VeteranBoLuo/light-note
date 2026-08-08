import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import BUpload from './BUpload.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
});

function mountUpload(props: Record<string, unknown> = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () => h(BUpload, { multiple: false, ...props });
    },
  });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en: { cloudSpace: { uploadFile: 'Upload file' } } } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('BUpload semantics', () => {
  it('is keyboard operable and announces its purpose', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const host = mountUpload();
    const trigger = host.querySelector<HTMLElement>('.b-upload-trigger');
    expect(trigger?.getAttribute('role')).toBe('button');
    expect(trigger?.getAttribute('tabindex')).toBe('0');
    expect(trigger?.getAttribute('aria-label')).toBe('Upload file');
    trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('keeps the native file input mounted and omits an unrestricted accept attribute', async () => {
    const host = mountUpload({ accept: '*' });
    await nextTick();
    const input = document.body.querySelector<HTMLInputElement>('.b-upload-native-input');
    expect(input).not.toBeNull();
    expect(input?.hasAttribute('accept')).toBe(false);

    const trigger = host.querySelector<HTMLElement>('.b-upload-trigger');
    const click = vi.spyOn(input as HTMLInputElement, 'click').mockImplementation(() => {});
    trigger?.click();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('supports an imperative-only picker without rendering the default upload card', async () => {
    const host = mountUpload({ triggerless: true });
    await nextTick();

    expect(host.querySelector('.b-upload-trigger')).toBeNull();
    expect(document.body.querySelector('.b-upload-native-input')).not.toBeNull();
  });

  it('emits selected raw files and resets the input for selecting the same file again', async () => {
    const onChange = vi.fn();
    mountUpload({ rawFile: true, onChange });
    await nextTick();
    const input = document.body.querySelector<HTMLInputElement>('.b-upload-native-input');
    expect(input).not.toBeNull();
    if (!input) throw new Error('native file input was not mounted');
    const file = new File(['content'], 'note.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    });

    input.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith([file]);
    expect(input.value).toBe('');
  });

  it('allows business components to disable the fixed picker size limit', async () => {
    const onChange = vi.fn();
    mountUpload({ rawFile: true, maxTotalSize: null, onChange });
    await nextTick();
    const input = document.body.querySelector<HTMLInputElement>('.b-upload-native-input');
    expect(input).not.toBeNull();
    if (!input) throw new Error('native file input was not mounted');
    const file = new File(['content'], 'archive.zip', { type: 'application/zip' });
    Object.defineProperty(file, 'size', { configurable: true, value: 20 * 1024 * 1024 });
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    });

    input.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalledWith([file]);
  });

  it('removes disabled triggers from the tab order', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const host = mountUpload({ disabled: true });
    const trigger = host.querySelector<HTMLElement>('.b-upload-trigger');
    expect(trigger?.getAttribute('tabindex')).toBe('-1');
    expect(trigger?.getAttribute('aria-disabled')).toBe('true');
    trigger?.click();
    expect(click).not.toHaveBeenCalled();
  });
});
