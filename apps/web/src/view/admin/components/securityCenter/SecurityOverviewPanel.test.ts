import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';

const apiBasePost = vi.fn();
const routerPush = vi.fn();

vi.mock('@/http/request', () => ({ apiBasePost }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/components/base/BasicComponents/BLoading.vue', () => ({
  default: { name: 'BLoadingStub', template: '<div><slot /></div>' },
}));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: { name: 'BSelectStub', template: '<div class="select-stub" />' },
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: { name: 'BButtonStub', template: '<button><slot /></button>' },
}));

const { default: SecurityOverviewPanel } = await import('./SecurityOverviewPanel.vue');

let cleanup: (() => void) | undefined;

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function mountOverview() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(SecurityOverviewPanel) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: {} }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('安全中心态势总览', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiBasePost.mockResolvedValue({
      status: 200,
      data: {
        summary: {},
        trend: [
          { date: '2026-08-08', raw: 2, confirmed: 0, falsePositive: 1, benignAnomaly: 0, authorizedTest: 1 },
          { date: '2026-08-09', raw: 17, confirmed: 3, falsePositive: 10, benignAnomaly: 2, authorizedTest: 2 },
        ],
        noisyRules: [
          {
            ruleCode: 'SSRF_PRIVATE_HOST',
            ruleName: 'SSRF 内网地址访问',
            mode: 'block',
            rawHits: 17,
            falsePositiveRate: 59,
            primaryRoute: '/chat/generateBookmarkMeta',
          },
        ],
        reviewQueue: [],
      },
    });
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('折线图悬浮时展示日期和三组数值，离开后关闭提示', async () => {
    const host = mountOverview();
    await flushPromises();
    const chart = host.querySelector<HTMLElement>('.security-v2-chart')!;
    expect(Array.from(host.querySelectorAll('.chart-axis-label')).map((item) => item.textContent)).toEqual([
      '08/08',
      '08/09',
    ]);
    chart.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      top: 0,
      right: 700,
      bottom: 184,
      left: 0,
      width: 700,
      height: 184,
      toJSON: () => ({}),
    });

    chart.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 700 }));
    await nextTick();

    const tooltip = host.querySelector<HTMLElement>('.security-chart-tooltip')!;
    expect(tooltip).toBeTruthy();
    expect(tooltip.textContent).toContain('规则命中17');
    expect(tooltip.textContent).toContain('确认攻击3');
    expect(tooltip.textContent).toContain('误报10');
    expect(tooltip.textContent).toContain('良性异常2');
    expect(tooltip.textContent).toContain('授权测试2');
    expect(host.querySelectorAll('.chart-hover-point')).toHaveLength(5);

    chart.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    await nextTick();
    expect(host.querySelector('.security-chart-tooltip')).toBeNull();
  });

  it('最吵规则展示真实命中量、主要接口和当前模式', async () => {
    const host = mountOverview();
    await flushPromises();

    const row = host.querySelector<HTMLElement>('.security-quality-row')!;
    expect(row.textContent).toContain('SSRF 内网地址访问');
    expect(row.textContent).toContain('/chat/generateBookmarkMeta · 命中 17 次');
    expect(row.textContent).toContain('拦截');
    expect(row.textContent).toContain('59%');
  });

  it('总览排行为空时使用检测质量数据恢复有命中的规则', async () => {
    apiBasePost.mockImplementation((url: string) => {
      if (url === '/api/security/v2/rules/quality') {
        return Promise.resolve({
          status: 200,
          data: {
            items: [
              { ruleCode: 'NO_HIT', ruleName: '无命中规则', mode: 'observe', rawHits: 0, falsePositiveRate: 100 },
              {
                ruleCode: 'SSRF_PRIVATE_HOST',
                ruleName: 'SSRF 内网地址访问',
                mode: 'block',
                rawHits: 17,
                falsePositiveRate: 59,
                primaryRoute: '/chat/generateBookmarkMeta',
              },
            ],
          },
        });
      }
      return Promise.resolve({
        status: 200,
        data: { summary: {}, trend: [], noisyRules: [], reviewQueue: [] },
      });
    });

    const host = mountOverview();
    await flushPromises();
    await flushPromises();

    expect(apiBasePost).toHaveBeenNthCalledWith(2, '/api/security/v2/rules/quality', { days: 7 }, { silent: true });
    expect(host.querySelectorAll('.security-quality-row')).toHaveLength(1);
    expect(host.textContent).toContain('SSRF 内网地址访问');
    expect(host.textContent).not.toContain('无命中规则');
  });
});
