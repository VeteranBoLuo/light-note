import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import BUpload from './BUpload.vue';
import message from './BMessage/BMessage';

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
  app.use(
    createI18n({
      legacy: false,
      locale: 'en',
      messages: {
        en: {
          cloudSpace: {
            uploadFile: 'Upload file',
            uploadSelectionLimit: 'Select up to {count} files at a time',
          },
        },
      },
    }),
  );
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
    const readSize = vi.spyOn(file, 'size', 'get').mockImplementation(() => {
      throw new Error('Raw uploads must defer metadata reads to the upload queue');
    });
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [file],
    });

    input.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0]).toBe(file);
    expect(readSize).not.toHaveBeenCalled();
  });

  it.each([101, 3000])(
    'rejects %i selections before enumerating files or reading metadata and resets the input',
    async (count) => {
      const warning = vi.spyOn(message, 'warning').mockImplementation(() => {});
      const onChange = vi.fn();
      mountUpload({ rawFile: true, maxCount: 100, maxTotalSize: null, onChange });
      await nextTick();
      const input = document.body.querySelector<HTMLInputElement>('.b-upload-native-input')!;
      const enumerate = vi.fn(() => {
        throw new Error('Oversized selection must not be enumerated');
      });
      Object.defineProperty(input, 'files', {
        configurable: true,
        value: { length: count, [Symbol.iterator]: enumerate },
      });
      const reset = vi.spyOn(input, 'value', 'set');
      input.dispatchEvent(new Event('change'));
      expect(enumerate).not.toHaveBeenCalled();
      expect(onChange).not.toHaveBeenCalled();
      expect(warning).toHaveBeenCalledWith('Select up to 100 files at a time');
      expect(reset).toHaveBeenCalledWith('');
    },
  );

  it('accepts exactly 100 raw files in order without using FileReader', async () => {
    const read = vi.spyOn(FileReader.prototype, 'readAsDataURL');
    const onChange = vi.fn();
    mountUpload({ rawFile: true, maxCount: 100, maxTotalSize: null, onChange });
    await nextTick();
    const files = Array.from({ length: 100 }, (_, i) => new File(['photo'], `photo-${i}.jpg`));
    const input = document.body.querySelector<HTMLInputElement>('.b-upload-native-input')!;
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledWith(files);
    expect(read).not.toHaveBeenCalled();
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

  it('supports a full-width trigger without changing the default sizing contract', () => {
    const blockHost = mountUpload({ block: true });
    expect(blockHost.querySelector('.b-upload-trigger')?.classList.contains('is-block')).toBe(true);
  });

  it('把外部属性透传给可见触发器而不是 Teleport 根节点', () => {
    const host = mountUpload({ class: 'external-upload', 'data-testid': 'upload-trigger' });
    const trigger = host.querySelector<HTMLElement>('.b-upload-trigger');

    expect(trigger?.classList.contains('external-upload')).toBe(true);
    expect(trigger?.dataset.testid).toBe('upload-trigger');
  });
});
