import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
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
