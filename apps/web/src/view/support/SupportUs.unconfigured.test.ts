import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  openAfdianSupportPage: vi.fn(() => false),
  openTrackedAfdianCheckout: vi.fn(() => false),
  openAfdianOAuthPage: vi.fn(() => false),
  getAfdianSupportState: vi.fn(async () => ({
    authenticated: false,
    oauthAvailable: false,
    orderSyncAvailable: false,
    linked: false,
    orderCount: 0,
    totalAmount: '0.00',
  })),
  unlinkAfdianAccount: vi.fn(async () => undefined),
  recordOperation: vi.fn(() => Promise.resolve()),
  messageWarning: vi.fn(),
}));

vi.mock('@/config/support', () => ({
  AFDIAN_SUPPORT_CONFIGURED: false,
  AFDIAN_SUPPORT_OPTIONS: [
    { key: 'coffee', amount: 6, url: '', configured: false },
    { key: 'server', amount: 18, url: '', configured: false },
    { key: 'companion', amount: 50, url: '', configured: false },
    { key: 'custom', amount: null, url: '', configured: false },
  ],
  openAfdianSupportPage: mocks.openAfdianSupportPage,
  openTrackedAfdianCheckout: mocks.openTrackedAfdianCheckout,
  openAfdianOAuthPage: mocks.openAfdianOAuthPage,
}));

vi.mock('@/api/supportApi', () => ({
  getAfdianSupportState: mocks.getAfdianSupportState,
  unlinkAfdianAccount: mocks.unlinkAfdianAccount,
}));

vi.mock('@/api/commonApi', () => ({
  recordOperation: mocks.recordOperation,
}));

vi.mock('@/store', () => ({
  bookmarkStore: () => ({ isMobile: false }),
}));

vi.mock('vue-router', async (importOriginal) => {
  const original = await importOriginal<typeof import('vue-router')>();
  return {
    ...original,
    useRouter: () => ({
      back: vi.fn(),
      push: vi.fn(() => Promise.resolve()),
      replace: vi.fn(() => Promise.resolve()),
      currentRoute: { value: { query: {} } },
    }),
  };
});

vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { warning: mocks.messageWarning },
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<i />' },
}));

vi.mock('@/composables/useMobileTopBar', () => ({
  useMobileTopBar: vi.fn(),
  getMobileTopBarBinding: vi.fn(() => null),
}));

import SupportUs from './SupportUs.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  Object.values(mocks).forEach((mock) => mock.mockClear());
});

describe('支持轻笺未配置状态', () => {
  it('明确提示未配置并禁用所有赞助按钮，不生成可误点的外链', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(SupportUs);
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': zhCN },
      }),
    );
    app.directive('click-log', {});
    app.directive('auto-scrollbar', {});
    app.mount(host);
    await nextTick();
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    const actions = Array.from(host.querySelectorAll<HTMLButtonElement>('button'));
    expect(actions).toHaveLength(7);
    expect(actions[0]?.disabled).toBe(false);
    const supportActions = actions.slice(1);
    expect(supportActions.every((action) => action.disabled)).toBe(true);
    expect(host.textContent).toContain('爱发电主页尚未配置');
    expect(host.querySelector('a[href]')).toBeNull();

    supportActions[0]?.click();
    await nextTick();
    expect(mocks.openAfdianSupportPage).not.toHaveBeenCalled();
    expect(mocks.messageWarning).not.toHaveBeenCalled();
  });
});
