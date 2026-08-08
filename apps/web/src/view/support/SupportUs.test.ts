import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  openAfdianSupportPage: vi.fn(() => true),
  recordOperation: vi.fn(() => Promise.resolve()),
  routerBack: vi.fn(),
  routerPush: vi.fn(() => Promise.resolve()),
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

describe('支持轻笺页面', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockClear());
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
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    expect(host.querySelector('h1')?.textContent).toContain('轻笺会一直免费');
    expect(host.textContent).toContain('赞助完全自愿');
    expect(host.textContent).toContain('赞助排行榜会基于真实订单生成');
    expect(host.textContent).toContain('真实赞助排行榜将在订单同步后上线');
    expect(host.textContent).toContain('支持匿名、不参与和撤回');
    expect(host.textContent).not.toContain('不会自动发积分、经验或生成赞助排行榜');

    const action = host.querySelector<HTMLButtonElement>('.support-primary-action');
    expect(action).not.toBeNull();
    expect(action?.disabled).toBe(false);
    action?.click();
    await nextTick();

    expect(mocks.openAfdianSupportPage).toHaveBeenCalledOnce();
    expect(mocks.recordOperation).toHaveBeenCalledWith({
      module: '支持轻笺',
      operation: '打开爱发电赞助主页',
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

    expect(mocks.openAfdianSupportPage).toHaveBeenLastCalledWith(
      'https://ifdian.net/order/create?plan_id=4415b194930c11f1ac7b5254001e7c00&product_type=0',
    );
    expect(mocks.recordOperation).toHaveBeenCalledWith({
      module: '支持轻笺',
      operation: '打开爱发电赞助档位:coffee',
    });
  });
});
