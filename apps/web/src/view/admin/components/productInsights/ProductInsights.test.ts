import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const apiMocks = vi.hoisted(() => ({ load: vi.fn(), report: vi.fn() }));
const messageMocks = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('@/api/commonApi', () => ({
  getAdminProductInsights: apiMocks.load,
  getAdminCoreUsageReport: apiMocks.report,
}));
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
      periodDays: 7,
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

  it('报告默认不查询，点击后生成；覆盖未知仍显示已记录比例与说明', async () => {
    const metric = {
      eligible: 3,
      observed: 1,
      value: null,
      status: 'coverage_unknown',
      reasons: ['coverage_start_unverified'],
    };
    apiMocks.report.mockResolvedValue({
      status: 200,
      data: {
        asOf: '2026-09-11T08:00:00Z',
        days: 7,
        cohort: { eligible: 3, immature: 1 },
        metrics: Object.fromEntries(
          ['a7Resources', 'a7Overall', 'r7Core', 'a7ResourcesLegacy', 'r7InteractionProxy'].map((key) => [key, metric]),
        ),
      },
    });
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(apiMocks.load).toHaveBeenCalledOnce());
    expect(apiMocks.report).not.toHaveBeenCalled();
    const button = Array.from(mounted.host.querySelectorAll('button')).find((el) =>
      el.textContent?.includes('生成报告'),
    )!;
    button.click();
    button.click();
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('记录完整性待确认'));
    expect(apiMocks.report).toHaveBeenCalledExactlyOnceWith({ days: 7 });
    expect(mounted.host.querySelector('.core-usage')?.textContent).toContain('33.33%');
    expect(mounted.host.querySelector('.core-usage')?.textContent).toContain('已记录比例');
    expect(mounted.host.textContent).toContain('已注册满 7 天 3 人');
    apiMocks.report.mockRejectedValueOnce(new Error('network'));
    button.click();
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('报告生成失败'));
    expect(mounted.host.textContent).toContain('已注册满 7 天 3 人');
  });

  it('部分记录显示已记录比例，零记录与不可计算状态明确区分', async () => {
    const metric = (observed: number | null, eligible: number, status: string) => ({
      observed,
      eligible,
      status,
      value: null,
      reasons: [],
    });
    apiMocks.report.mockResolvedValue({
      status: 200,
      data: {
        asOf: '2026-09-11T08:00:00Z',
        days: 7,
        cohort: { eligible: 236, immature: 25 },
        metrics: {
          a7Resources: metric(84, 236, 'partial_coverage'),
          a7Overall: metric(0, 236, 'coverage_unknown'),
          r7Core: metric(null, 236, 'unavailable'),
          a7ResourcesLegacy: metric(0, 0, 'no_mature_cohort'),
          r7InteractionProxy: metric(1, 0, 'coverage_unknown'),
        },
      },
    });
    const mounted = mountPage();
    cleanup = mounted.unmount;
    Array.from(mounted.host.querySelectorAll('button'))
      .find((el) => el.textContent?.includes('生成报告'))!
      .click();
    await vi.waitFor(() => expect(mounted.host.querySelector('.core-usage')?.textContent).toContain('35.59%'));
    const content = mounted.host.querySelector('.core-usage')!.textContent!;
    expect(content).toContain('0%');
    expect(content).toContain('—');
    expect(content).not.toMatch(/NaN|Infinity/);
    expect(content).toContain('实际比例可能更高');
  });

  it('只有一个时间选择；切换范围后忽略在途旧报告且不自动生成', async () => {
    let resolveReport: (value: unknown) => void = () => {};
    apiMocks.report.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveReport = resolve;
        }),
    );
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.querySelector('.product-insights__feature-grid')).not.toBeNull());
    expect(mounted.host.querySelectorAll('[role="combobox"]')).toHaveLength(1);
    Array.from(mounted.host.querySelectorAll('button'))
      .find((el) => el.textContent?.includes('生成报告'))!
      .click();
    await vi.waitFor(() => expect(apiMocks.report).toHaveBeenCalledOnce());
    (mounted.host.querySelector('[role="combobox"]') as HTMLElement).click();
    await vi.waitFor(() => expect(document.querySelector('[role="listbox"]')).not.toBeNull());
    (
      Array.from(document.querySelectorAll('[role="option"]')).find((el) =>
        el.textContent?.includes('近 30 天'),
      ) as HTMLElement
    ).click();
    await vi.waitFor(() => expect(apiMocks.load).toHaveBeenLastCalledWith({ periodDays: 30 }));
    resolveReport({
      status: 200,
      data: { asOf: '2026-01-01T00:00:00Z', days: 7, cohort: { eligible: 777, immature: 0 }, metrics: {} },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mounted.host.textContent).not.toContain('777');
    expect(mounted.host.querySelector('.core-usage__hint[role="status"]')).toBeNull();
    expect(apiMocks.report).toHaveBeenCalledOnce();
  });

  it.each([
    ['2026-08-31', '2026年8月31日 — 9月6日'],
    ['2025-12-29', '2025年12月29日 — 2026年1月4日'],
  ])('注册周显示完整日期范围，包括跨月跨年 %s', async (start, expected) => {
    const result = payload();
    result.data.cohorts[0].cohortStart = start;
    apiMocks.load.mockResolvedValue(result);
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain(expected));
  });

  it('主分析失败仍可发现报告入口并显示重试反馈', async () => {
    apiMocks.load.mockRejectedValueOnce(new Error('network'));
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.textContent).toContain('产品运营分析加载失败'));
    expect(mounted.host.textContent).toContain('生成报告');
    expect(apiMocks.report).not.toHaveBeenCalled();
  });

  it('没有成熟激活样本显示未知，不显示零转化率', async () => {
    const result = payload();
    Object.assign(result.data.summary, { activationEligible: 0, activationRate: null });
    apiMocks.load.mockResolvedValue(result);
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.querySelector('.product-insights__feature-grid')).not.toBeNull());
    const cards = Array.from(mounted.host.querySelectorAll('.admin-stat-card'));
    const activation = cards.find((card) => card.textContent?.includes('一周内保存过资料'));
    expect(activation?.querySelector('.admin-stat-value')?.textContent).toBe('—');
  });

  it('展示匿名功能采用与成熟度，不因可选社区表缺失而隐藏其余指标', async () => {
    const mounted = mountPage();
    cleanup = mounted.unmount;
    await vi.waitFor(() => expect(mounted.host.querySelector('.product-insights__feature-grid')).not.toBeNull());

    expect(apiMocks.load).toHaveBeenCalledWith({ periodDays: 7 });
    expect(mounted.host.textContent).toContain('最近来过的人');
    expect(mounted.host.textContent).toContain('50%');
    expect(mounted.host.textContent).toContain('AI 助手');
    expect(mounted.host.textContent).toContain('部分记录暂时查不到');
    expect(mounted.host.textContent).toContain('社区客厅');
    expect(mounted.host.textContent).toContain('还没到统计时间');
    expect(mounted.host.textContent).toContain('50% · 2/4');
    expect(mounted.host.textContent).toContain('回来人数 / 已到统计时间的人数');
    expect(mounted.host.textContent).not.toContain('人中有');
  });
});
