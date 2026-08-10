import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const apiMocks = vi.hoisted(() => ({ load: vi.fn() }));
const messageMocks = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('@/api/commonApi', () => ({ getAdminProductInsights: apiMocks.load }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({ default: messageMocks }));
vi.mock('@/store', () => ({ bookmarkStore: () => ({ isMobile: false }) }));
vi.mock('@/components/admin/AdminDataPage.vue', () => ({
  default: {
    name: 'AdminDataPageStub',
    template:
      '<main><div class="actions"><slot name="actions" /></div><div class="metrics"><slot name="metrics" /></div><slot /></main>',
  },
}));

const { default: ProductInsights } = await import('./ProductInsights.vue');

function payload() {
  return {
    status: 200,
    data: {
      generatedAt: '2026-08-09 12:00:00',
      periodDays: 30,
      cohortWeeks: 8,
      summary: { activeUsers: 20, newUsers: 8, activatedUsers: 4, activationRate: 50, aiAdoptionRate: 25 },
      features: [
        { source: 'bookmark', available: true, users: 10, events: 35, rate: 50 },
        { source: 'ai', available: true, users: 5, events: 28, rate: 25 },
        { source: 'community', available: false, users: 0, events: 0, rate: 0 },
      ],
      cohorts: [
        {
          cohortStart: '2026-08-03',
          registered: 5,
          d1: { eligible: 4, retained: 2, rate: 50 },
          d7: { eligible: 0, retained: 0, rate: 0 },
          d30: { eligible: 0, retained: 0, rate: 0 },
        },
      ],
      unavailableSources: ['community'],
    },
  };
}

function mountPage() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(ProductInsights) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  return {
    host,
    unmount() {
      app.unmount();
      host.remove();
    },
  };
}

describe('ProductInsights', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.load.mockResolvedValue(payload());
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.innerHTML = '';
  });

  it('展示匿名功能采用与成熟度，不因可选社区表缺失而隐藏其余指标', async () => {
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('功能采用'));

    expect(apiMocks.load).toHaveBeenCalledWith({ periodDays: 30, cohortWeeks: 8 });
    expect(mounted.host.textContent).toContain('活跃用户');
    expect(mounted.host.textContent).toContain('50%');
    expect(mounted.host.textContent).toContain('AI 助手');
    expect(mounted.host.textContent).toContain('部分数据源暂不可用');
    expect(mounted.host.textContent).toContain('社区客厅');
    expect(mounted.host.textContent).toContain('尚未成熟');
  });
});
