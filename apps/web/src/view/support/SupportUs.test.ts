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
    publicPreference: { participateInRanking: true, showIdentity: true, adminHidden: false },
    recentOrders: [],
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
  afdianLeaderboardAvatarUrl: (publicId: string) => '/api/support/leaderboard/avatar/' + publicId,
}));
vi.mock('@/api/commonApi', () => ({ recordOperation: mocks.recordOperation }));
vi.mock('@/store', () => ({ useUserStore: () => ({ id: 'test-user' }), bookmarkStore: () => ({ isMobile: false }) }));
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
  default: { success: mocks.messageSuccess, error: mocks.messageError, warning: mocks.messageWarning },
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

async function mountPage() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(SupportUs);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.directive('click-log', {});
  app.directive('auto-scrollbar', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await vi.waitFor(() => expect(host.textContent).toContain('赞助记录与账号关联'));
  return host;
}

describe('支持轻笺纯赞助页面', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear());
    routeState.query = {};
  });
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('用正向文案区分赞助与购买，并只用跟踪赞助意图打开爱发电', async () => {
    const host = await mountPage();
    expect(host.querySelector('h1')?.textContent).toContain('每一份支持');
    expect(host.textContent).toContain('参与榜单 · 公开昵称与头像');
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('修改公开设置'))
      ?.click();
    await nextTick();
    expect(document.querySelector<HTMLElement>('[role="switch"]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).not.toContain('不赠送');
    expect(host.textContent).toContain('不包含 AI 额度或云空间套餐');
    expect(host.querySelector('.support-tier-card__nature')).toBeNull();
    expect(host.textContent).toContain('需要 AI 额度或云空间');
    expect(host.textContent).toContain('赞助记录和购买记录会分别展示');
    expect(host.textContent).not.toContain('每实付 ¥1 赠送');
    expect(host.textContent).not.toContain('首充专享加量');

    const primary = host.querySelector<HTMLButtonElement>('.support-primary-action');
    primary?.click();
    await nextTick();
    expect(mocks.openTrackedAfdianCheckout).toHaveBeenCalledWith('custom');
    expect(mocks.openAfdianSupportPage).not.toHaveBeenCalled();
    expect(mocks.recordOperation).toHaveBeenCalledWith({
      module: '支持轻笺',
      operation: '打开爱发电赞助入口',
    });

    const tierActions = host.querySelectorAll<HTMLButtonElement>('.support-tier-card__action');
    expect(tierActions).toHaveLength(4);
    tierActions[0]?.click();
    await nextTick();
    expect(mocks.openTrackedAfdianCheckout).toHaveBeenLastCalledWith('coffee');

    const storeAction = [...host.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('查看资源套餐'),
    );
    storeAction?.click();
    expect(mocks.routerPush).toHaveBeenCalledWith('/store');
  });

  it('保留匿名、公开和退出排行榜控制，且排行榜只描述已确认赞助', async () => {
    mocks.getAfdianSupportState.mockResolvedValueOnce({
      authenticated: true,
      oauthAvailable: true,
      orderSyncAvailable: true,
      linked: false,
      orderCount: 0,
      totalAmount: '0.00',
      publicPreference: { participateInRanking: true, showIdentity: false, adminHidden: false },
      recentOrders: [],
    });
    const host = await mountPage();
    expect(host.textContent).toContain('参与榜单 · 匿名展示');
    [...host.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes('修改公开设置'))
      ?.click();
    await nextTick();
    expect(document.body.textContent).toContain('当前以匿名支持者展示');
    expect(host.textContent).toContain('这里只展示爱发电已确认收款、并已加入轻笺账号支持记录的真实赞助');

    document.querySelector<HTMLElement>('[role="switch"]')?.click();
    await vi.waitFor(() =>
      expect(mocks.updateAfdianPublicPreference).toHaveBeenCalledWith({
        participateInRanking: true,
        showIdentity: true,
      }),
    );
    const leaveButton = document.querySelector<HTMLButtonElement>('.support-account-panel__participation');
    expect(leaveButton?.textContent).toContain('退出榜单');
    await vi.waitFor(() => expect(leaveButton?.disabled).toBe(false));
    leaveButton?.click();
    await nextTick();
    await vi.waitFor(() =>
      expect(mocks.updateAfdianPublicPreference).toHaveBeenLastCalledWith({
        participateInRanking: false,
        showIdentity: false,
      }),
    );
  });

  it('未关联账号可从摘要直接发起爱发电关联', async () => {
    const host = await mountPage();
    const button = host.querySelector<HTMLButtonElement>('.support-account-link');
    expect(button?.textContent).toContain('关联爱发电');
    expect(button?.disabled).toBe(false);
    button?.click();
    expect(mocks.openAfdianOAuthPage).toHaveBeenCalledOnce();
    expect(mocks.openTrackedAfdianCheckout).not.toHaveBeenCalled();
  });

  it.each([
    { authenticated: true, linked: true, oauthAvailable: true, visible: false },
    { authenticated: false, linked: false, oauthAvailable: true, visible: false },
    { authenticated: true, linked: false, oauthAvailable: false, visible: true },
  ])('关联入口遵守账号和服务状态 $authenticated/$linked/$oauthAvailable', async (state) => {
    mocks.getAfdianSupportState.mockResolvedValueOnce({
      ...state,
      orderSyncAvailable: true,
      orderCount: 0,
      totalAmount: '0.00',
      publicPreference: { participateInRanking: true, showIdentity: true, adminHidden: false },
      recentOrders: [],
    });
    const host = await mountPage();
    const button = host.querySelector<HTMLButtonElement>('.support-account-link');
    expect(Boolean(button)).toBe(state.visible);
    if (button) {
      expect(button.disabled).toBe(true);
      button.click();
    }
    expect(mocks.openAfdianOAuthPage).not.toHaveBeenCalled();
  });

  it('游客走爱发电主页并提示关联只用于赞助归属和上榜', async () => {
    mocks.getAfdianSupportState.mockResolvedValueOnce({
      authenticated: false,
      oauthAvailable: true,
      orderSyncAvailable: true,
      linked: false,
      orderCount: 0,
      totalAmount: '0.00',
      publicPreference: { participateInRanking: true, showIdentity: true, adminHidden: false },
      recentOrders: [],
    });
    const host = await mountPage();
    expect(host.textContent).toContain('直接从爱发电主页赞助不会自动归入轻笺');
    expect(host.textContent).toContain('如需上榜');
    host.querySelector<HTMLButtonElement>('.support-primary-action')?.click();
    await nextTick();
    expect(mocks.openAfdianSupportPage).toHaveBeenCalledOnce();
    expect(mocks.openTrackedAfdianCheckout).not.toHaveBeenCalled();
  });

  it.each([
    ['bound', '已成功关联爱发电账号', 'success'],
    ['failed', '爱发电账号关联失败，请重新发起', 'error'],
    ['session_required', '登录状态已失效，请重新登录后再关联爱发电', 'warning'],
  ])('反馈 OAuth 结果 %s 并清理一次性参数', async (result, expected, messageType) => {
    routeState.query = { afdian: result, source: 'test' };
    await mountPage();
    const messageMock =
      messageType === 'success'
        ? mocks.messageSuccess
        : messageType === 'error'
          ? mocks.messageError
          : mocks.messageWarning;
    await vi.waitFor(() => expect(messageMock).toHaveBeenCalledWith(expected));
    expect(mocks.routerReplace).toHaveBeenCalledWith({ query: { source: 'test' } });
  });
});
