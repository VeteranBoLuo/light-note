// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MobilePageActionsDrawer from './MobilePageActionsDrawer.vue';
import i18n from '@/i18n';

const overlayHandoff = vi.hoisted(() => ({
  continueAction: null as null | (() => Promise<void>),
}));

vi.mock('@/utils/mobileOverlayHistory', () => ({
  registerMobileOverlayHistory: () => null,
  releaseMobileOverlayHistory: () => undefined,
  requestMobileOverlayHistoryClose: () => false,
  closeCurrentMobileOverlayThen: (close: () => void, next: () => void | Promise<void>) => {
    close();
    return new Promise<void>((resolve) => {
      overlayHandoff.continueAction = async () => {
        await next();
        resolve();
      };
    });
  },
}));

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  overlayHandoff.continueAction = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('MobilePageActionsDrawer', () => {
  it('关闭抽屉的 history 占位释放后才派发业务动作', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const host = document.createElement('div');
    document.body.appendChild(host);
    const updates: boolean[] = [];
    const actions: string[] = [];
    const app = createApp({
      setup: () => {
        const open = ref(true);
        return () =>
          h(MobilePageActionsDrawer, {
            open: open.value,
            title: '更多格式',
            actions: [{ key: 'shortcuts', label: '快捷键' }],
            'onUpdate:open': (value: boolean) => {
              open.value = value;
              updates.push(value);
            },
            onAction: (action: { key: string }) => actions.push(action.key),
          });
      },
    });
    app.use(i18n);
    app.mount(host);
    await nextTick();
    await nextTick();
    cleanups.push(() => {
      app.unmount();
      host.remove();
    });

    const actionButton = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('快捷键'),
    );
    actionButton?.click();
    await nextTick();

    expect(updates).toEqual([false]);
    expect(actions).toEqual([]);

    const continueAction = overlayHandoff.continueAction?.();
    await nextTick();
    expect(actions).toEqual([]);

    vi.advanceTimersByTime(220);
    await nextTick();
    await continueAction;
    expect(actions).toEqual(['shortcuts']);
  });
});
