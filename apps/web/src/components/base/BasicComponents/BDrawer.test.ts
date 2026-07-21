import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import BDrawer from './BDrawer.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.querySelectorAll('.b-drawer-wrapper').forEach((element) => element.remove());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.documentElement.style.zoom = '';
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 0 });
});

describe('BDrawer compositor cleanup', () => {
  it('releases the transform layer even when transitionend is not emitted', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup() {
        return () => h(BDrawer, { open: true, title: 'Test drawer' });
      },
    });
    app.use(createI18n({ legacy: false, locale: 'en', messages: { en: { common: { close: 'Close' } } } }));
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    await nextTick();
    await nextTick();
    const wrapper = document.querySelector('.b-drawer-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.classList.contains('is-entered')).toBe(true);
    expect(wrapper!.classList.contains('is-settled')).toBe(false);

    vi.advanceTimersByTime(240);
    await nextTick();
    expect(wrapper!.classList.contains('is-settled')).toBe(true);
  });

  it('exposes dialog semantics, closes with Escape, restores focus, and can keep content mounted', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const opener = document.createElement('button');
    opener.textContent = 'Open';
    document.body.append(opener);
    opener.focus();
    const open = ref(true);
    const onClose = vi.fn(() => {
      open.value = false;
    });
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup() {
        return () =>
          h(
            BDrawer,
            { open: open.value, title: 'Accessible drawer', destroyOnClose: false, onClose },
            { default: () => h('button', { class: 'drawer-action' }, 'Action') },
          );
      },
    });
    app.use(createI18n({ legacy: false, locale: 'en', messages: { en: { common: { close: 'Close' } } } }));
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
      opener.remove();
    };

    await nextTick();
    await nextTick();
    const panel = document.querySelector<HTMLElement>('.b-drawer-panel');
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.getAttribute('aria-modal')).toBe('true');
    expect(panel?.getAttribute('aria-labelledby')).toMatch(/^b-drawer-title-/);
    expect(document.activeElement).toBe(panel);

    panel!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await nextTick();
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(220);
    await nextTick();
    const wrapper = document.querySelector('.b-drawer-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper?.classList.contains('is-hidden')).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it('supports a non-modal resizable sidecar without stealing focus', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });

    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup() {
        return () =>
          h(BDrawer, {
            open: true,
            title: 'Sidecar',
            modal: false,
            resizable: true,
            width: '560px',
            minWidth: 440,
            maxWidth: 720,
          });
      },
    });
    app.use(
      createI18n({
        legacy: false,
        locale: 'en',
        messages: { en: { common: { close: 'Close', resize: 'Resize' } } },
      }),
    );
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
      opener.remove();
    };

    await nextTick();
    await nextTick();
    const wrapper = document.querySelector('.b-drawer-wrapper');
    const panel = document.querySelector<HTMLElement>('.b-drawer-panel');
    const separator = document.querySelector<HTMLElement>('[role="separator"]');
    expect(wrapper?.classList.contains('is-non-modal')).toBe(true);
    expect(document.querySelector('.b-drawer-mask')).toBeNull();
    expect(panel?.hasAttribute('aria-modal')).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(separator?.getAttribute('aria-valuenow')).toBe('560');

    separator?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await nextTick();
    expect(separator?.getAttribute('aria-valuenow')).toBe('576');
    expect(panel?.style.width).toBe('576px');
  });

  it('normalizes pointer coordinates under root zoom and clamps to a narrow desktop viewport', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    document.documentElement.style.zoom = '1.25';
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 960 });

    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup() {
        return () =>
          h(BDrawer, {
            open: true,
            title: 'Zoomed sidecar',
            modal: false,
            resizable: true,
            width: '640px',
            minWidth: 440,
            maxWidth: 720,
          });
      },
    });
    app.use(
      createI18n({
        legacy: false,
        locale: 'en',
        messages: { en: { common: { close: 'Close', resize: 'Resize' } } },
      }),
    );
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    await nextTick();
    await nextTick();
    const panel = document.querySelector<HTMLElement>('.b-drawer-panel');
    const separator = document.querySelector<HTMLElement>('[role="separator"]');
    const pointerDown = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperty(pointerDown, 'clientX', { value: 500 });
    separator?.dispatchEvent(pointerDown);
    await nextTick();
    // 按下不改宽度(修复「按一下就跳变/闪」):仍是初始 640
    expect(panel?.style.width).toBe('640px');

    // 拖动:向左移(clientX 减小)增宽;位移经 root zoom 归一化(50 / 1.25 = 40)→ 640 + 40 = 680
    const pointerMove = new Event('pointermove', { bubbles: true });
    Object.defineProperty(pointerMove, 'clientX', { value: 450 });
    window.dispatchEvent(pointerMove);
    await nextTick();
    expect(panel?.style.width).toBe('680px');

    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 400 });
    window.dispatchEvent(new Event('resize'));
    await nextTick();
    expect(panel?.style.width).toBe('360px');
    expect(panel?.style.minWidth).toBe('360px');
    expect(separator?.getAttribute('aria-valuemax')).toBe('360');
  });
});
