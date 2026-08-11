import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  closeCurrentMobileOverlayThen: vi.fn(async (close: () => void, next: () => unknown) => {
    mocks.order.push('close');
    close();
    await Promise.resolve();
    mocks.order.push('next');
    return next();
  }),
}));

vi.mock('@/utils/mobileOverlayHistory', () => ({
  closeCurrentMobileOverlayThen: mocks.closeCurrentMobileOverlayThen,
}));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    props: ['visible'],
    emits: ['update:visible'],
    template: '<section v-if="visible" class="modal-stub"><slot /></section>',
  },
}));
vi.mock('@/components/communityChat/CommunityChatNotificationSettingsPanel.vue', () => ({
  default: { template: '<div class="notification-settings-stub" />' },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span />' },
}));

const { default: ChatSettingsModal } = await import('./ChatSettingsModal.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  mocks.order.length = 0;
  vi.clearAllMocks();
});

describe('ChatSettingsModal', () => {
  it('关闭当前设置浮层并等待历史占位释放后才打开屏蔽管理', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(ChatSettingsModal, {
      visible: true,
      'onUpdate:visible': (visible: boolean) => {
        if (!visible) mocks.order.push('model');
      },
      onManageBlocks: () => mocks.order.push('emit'),
    });
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': zhCN },
      }),
    );
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((item) =>
      item.textContent?.includes(zhCN.communityChat.settings.blockedUsersAction),
    );
    button?.click();
    await Promise.resolve();
    await nextTick();

    expect(mocks.closeCurrentMobileOverlayThen).toHaveBeenCalledTimes(1);
    expect(mocks.order).toEqual(['close', 'model', 'next', 'emit']);
  });

  it('关闭设置浮层后再打开自己的社区名片，避免移动端遮罩层相互抢占', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(ChatSettingsModal, {
      visible: true,
      'onUpdate:visible': (visible: boolean) => {
        if (!visible) mocks.order.push('model');
      },
      onManageProfile: () => mocks.order.push('profile'),
    });
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': zhCN },
      }),
    );
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((item) =>
      item.textContent?.includes(zhCN.communityChat.settings.ownProfileAction),
    );
    button?.click();
    await Promise.resolve();
    await nextTick();

    expect(mocks.closeCurrentMobileOverlayThen).toHaveBeenCalledTimes(1);
    expect(mocks.order).toEqual(['close', 'model', 'next', 'profile']);
  });
});
