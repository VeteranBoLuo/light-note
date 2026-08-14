import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const routeState = vi.hoisted(() => ({ query: {} as Record<string, string> }));

const mocks = vi.hoisted(() => ({
  openAfdianSupportPage: vi.fn(() => true),
  openTrackedAfdianCheckout: vi.fn(() => true),
  openAfdianOAuthPage: vi.fn(() => true),
  getAfdianSupportState: vi.fn(async () => ({
    authenticated: true,
    oauthAvailable: true,
    orderSyncAvailable: true,
    linked: false,
    orderCount: 0,
    totalAmount: '0.00',
  })),
  unlinkAfdianAccount: vi.fn(async () => undefined),
  getAfdianLeaderboard: vi.fn(async () => ({ scope: 'all_time', items: [], mine: null, totalParticipants: 0 })),
  updateAfdianPublicPreference: vi.fn(async (value) => ({ ...value, adminHidden: false })),
  recordOperation: vi.fn(() => Promise.resolve()),
  routerBack: vi.fn(),
  routerPush: vi.fn(() => Promise.resolve()),
  routerReplace: vi.fn(() => Promise.resolve()),
  messageSuccess: vi.fn(),
  messageError: vi.fn(),
  messageWarning: vi.fn(),
}));

vi.mock('@/config/support', () => ({
  AFDIAN_SUPPORT_CONFIGURED: true,
  AFDIAN_SUPPORT_OPTIONS: [
    {
      key: 'coffee',
      amount: 6,
      url: 'https://ifdian.net/order/create?plan_id=4415b194930c11f1ac7b5254001e7c00&product_type=0',
      configured: true,
    },
    {
      key: 'server',
      amount: 18,
      url: 'https://ifdian.net/order/create?plan_id=a05f9730930c11f1aeb65254001e7c00&product_type=0',
      configured: true,
    },
    {
      key: 'companion',
      amount: 50,
      url: 'https://ifdian.net/order/create?plan_id=9fc7a358930c11f1abee52540025c377&product_type=0',
      configured: true,
    },
    {
      key: 'custom',
      amount: null,
      url: 'https://ifdian.net/order/create?user_id=9a64b3ac930611f18e8052540025c377',
      configured: true,
    },
  ],
  openAfdianSupportPage: mocks.openAfdianSupportPage,
  openTrackedAfdianCheckout: mocks.openTrackedAfdianCheckout,
  openAfdianOAuthPage: mocks.openAfdianOAuthPage,
}));

vi.mock('@/api/supportApi', () => ({
  getAfdianSupportState: mocks.getAfdianSupportState,
  unlinkAfdianAccount: mocks.unlinkAfdianAccount,
  getAfdianLeaderboard: mocks.getAfdianLeaderboard,
  updateAfdianPublicPreference: mocks.updateAfdianPublicPreference,
  afdianLeaderboardAvatarUrl: (publicId: string) => `/api/support/leaderboard/avatar/${publicId}`,
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
      back: mocks.routerBack,
      push: mocks.routerPush,
      replace: mocks.routerReplace,
      currentRoute: { value: routeState },
    }),
  };
});

vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: {
    success: mocks.messageSuccess,
    error: mocks.messageError,
    warning: mocks.messageWarning,
  },
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

describe('支持轻笺页面', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear());
    routeState.query = {};
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('明确免费承诺，并从 BButton 打开受控的爱发电入口', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(SupportUs);
    const i18n = createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
    });
    app.use(i18n);
    app.directive('click-log', {});
    app.directive('auto-scrollbar', {});
    app.mount(host);
    await nextTick();
    await vi.waitFor(() => expect(host.textContent).toContain('赞助记录与账号关联'));
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    expect(host.querySelector('h1')?.textContent).toContain('轻笺会一直免费');
    expect(host.textContent).toContain('赞助完全自愿');
    expect(host.textContent).toContain('月度榜与累计榜只会基于已复核订单');
    expect(host.textContent).toContain('真实订单会安全归并');
    expect(host.textContent).toContain('支持匿名、不参与和撤回');
    expect(host.textContent).not.toContain('不会自动发积分、经验或生成赞助排行榜');

    const action = host.querySelector<HTMLButtonElement>('.support-primary-action');
    expect(action).not.toBeNull();
    expect(action?.disabled).toBe(false);
    action?.click();
    await nextTick();

    expect(mocks.openTrackedAfdianCheckout).toHaveBeenCalledWith('custom');
    expect(mocks.openAfdianSupportPage).not.toHaveBeenCalled();
    expect(mocks.recordOperation).toHaveBeenCalledWith({
      module: '支持轻笺',
      operation: '打开爱发电赞助入口',
    });
    expect(mocks.messageWarning).not.toHaveBeenCalled();

    expect(host.textContent).toContain('¥6');
    expect(host.textContent).toContain('¥18');
    expect(host.textContent).toContain('¥50');
    expect(host.textContent).toContain('自选金额');

    const tierActions = host.querySelectorAll<HTMLButtonElement>('.support-tier-card__action');
    expect(tierActions).toHaveLength(4);
    tierActions[0]?.click();
    await nextTick();

    expect(mocks.openTrackedAfdianCheckout).toHaveBeenLastCalledWith('coffee');
    expect(mocks.openAfdianSupportPage).not.toHaveBeenCalled();
    expect(mocks.recordOperation).toHaveBeenCalledWith({
      module: '支持轻笺',
      operation: '打开爱发电赞助档位:coffee',
    });
    expect(host.textContent).toContain('无需关联也能赞助');
    expect(host.textContent).toContain('当前以匿名支持者展示');

    host.querySelector<HTMLElement>('[role="switch"]')?.click();
    await vi.waitFor(() =>
      expect(mocks.updateAfdianPublicPreference).toHaveBeenCalledWith({
        participateInRanking: true,
        showIdentity: true,
      }),
    );
    await vi.waitFor(() => expect(mocks.messageSuccess).toHaveBeenCalledWith('榜单展示偏好已保存'));

    const leaveButton = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('退出榜单'),
    );
    leaveButton?.click();
    await vi.waitFor(() =>
      expect(mocks.updateAfdianPublicPreference).toHaveBeenLastCalledWith({
        participateInRanking: false,
        showIdentity: false,
      }),
    );
  });

  it.each([
    ['bound', '已成功关联爱发电账号', 'success'],
    ['failed', '爱发电账号关联失败，请重新发起', 'error'],
    ['session_required', '登录状态已失效，请重新登录后再关联爱发电', 'warning'],
  ])('明确反馈 OAuth 回调结果 %s 并清理一次性地址参数', async (result, expected, messageType) => {
    routeState.query = { afdian: result, source: 'test' };
    if (result === 'bound') {
      mocks.getAfdianSupportState.mockResolvedValueOnce({
        authenticated: true,
        oauthAvailable: true,
        orderSyncAvailable: true,
        linked: true,
        linkedAt: '2026-08-14T00:00:00.000Z',
        orderCount: 0,
        totalAmount: '0.00',
      });
    }
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
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    const messageMock =
      messageType === 'success'
        ? mocks.messageSuccess
        : messageType === 'error'
          ? mocks.messageError
          : mocks.messageWarning;
    await vi.waitFor(() => expect(messageMock).toHaveBeenCalledWith(expected));
    expect(mocks.routerReplace).toHaveBeenCalledWith({ query: { source: 'test' } });
    if (result === 'bound') {
      expect(host.textContent).toContain('已关联');
      const fallback = host.querySelector<HTMLElement>('.support-account-panel__provider-fallback');
      expect(fallback).not.toBeNull();
      expect(fallback?.textContent?.trim()).toBe('爱');
    }
  });
});
