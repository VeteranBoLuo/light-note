// @vitest-environment jsdom
import { createApp, h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MobilePageActionsDrawer from './MobilePageActionsDrawer.vue';
import i18n from '@/i18n';

const overlayHandoff = vi.hoisted(() => ({
  continueAction: null as null | (() => void),
}));

vi.mock('@/utils/mobileOverlayHistory', () => ({
  registerMobileOverlayHistory: () => null,
  releaseMobileOverlayHistory: () => undefined,
  requestMobileOverlayHistoryClose: () => false,
  closeCurrentMobileOverlayThen: (close: () => void, next: () => void) => {
    close();
    return new Promise<void>((resolve) => {
      overlayHandoff.continueAction = () => {
        next();
        resolve();
      };
    });
  },
}));

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  overlayHandoff.continueAction = null;
});

describe('MobilePageActionsDrawer', () => {
  it('关闭抽屉的 history 占位释放后才派发业务动作', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const updates: boolean[] = [];
    const actions: string[] = [];
    const app = createApp({
      setup: () => () =>
        h(MobilePageActionsDrawer, {
          open: true,
          title: '更多格式',
          actions: [{ key: 'shortcuts', label: '快捷键' }],
          'onUpdate:open': (open: boolean) => updates.push(open),
          onAction: (action: { key: string }) => actions.push(action.key),
        }),
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

    overlayHandoff.continueAction?.();
    await nextTick();
    expect(actions).toEqual(['shortcuts']);
  });
});
