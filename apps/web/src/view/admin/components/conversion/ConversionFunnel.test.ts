import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';

const apiBasePost = vi.fn();

vi.mock('@/http/request.ts', () => ({ apiBasePost }));
vi.mock('@/http/request', () => ({ apiBasePost }));
vi.mock('@/components/admin/AdminDataPage.vue', () => ({
  default: {
    name: 'AdminDataPageStub',
    template: '<div class="page-stub"><slot name="toolbar" /><slot /></div>',
  },
}));
vi.mock('@/components/base/BasicComponents/BTable/BTable.vue', () => ({
  default: { name: 'BTableStub', template: '<div class="table-stub" />' },
}));
vi.mock('./ConversionTrendChart.vue', () => ({
  default: { name: 'ConversionTrendChartStub', template: '<div class="trend-stub" />' },
}));
vi.mock('./DateRangePicker.vue', () => ({
  default: {
    name: 'DateRangePickerStub',
    emits: ['change'],
    template: '<div class="drp-stub" />',
    mounted() {
      (this as unknown as { $emit: (event: string, ...args: unknown[]) => void }).$emit(
        'change',
        '2026-07-01',
        '2026-07-31',
      );
    },
  },
}));

const { default: ConversionFunnel } = await import('./ConversionFunnel.vue');

const REAL_DATA = {
  pageViewVisitors: 580,
  demoEnterVisitors: 72,
  wallHitVisitors: 66,
  signupOpenVisitors: 192,
  signupSubmitVisitors: 140,
  registerVisitors: 115,
  demoThenSignupOpenVisitors: 18,
  directSignupOpenVisitors: 174,
  demoThenRegisterVisitors: 18,
  directRegisterVisitors: 97,
  wallThenSignupOpenVisitors: 28,
  hotspots: [],
  trend: [],
  mainFunnel: [
    { key: 'pageView', label: '访问', count: 580, fromPreviousRate: null, lost: null },
    { key: 'signupOpen', label: '打开注册', count: 192, fromPreviousRate: 33.1, lost: 388 },
    { key: 'signupSubmit', label: '提交注册', count: 140, fromPreviousRate: 72.9, lost: 52 },
    { key: 'registerSuccess', label: '注册成功', count: 115, fromPreviousRate: 82.1, lost: 25 },
  ],
  orderedFunnel: [
    { key: 'pageView', label: '访问', count: 580, fromPreviousRate: null, lost: null },
    { key: 'signupOpen', label: '打开注册', count: 180, fromPreviousRate: 31, lost: 400 },
    { key: 'signupSubmit', label: '提交注册', count: 128, fromPreviousRate: 71.1, lost: 52 },
    { key: 'registerSuccess', label: '注册成功', count: 96, fromPreviousRate: 75, lost: 32 },
  ],
};

let cleanup: (() => void) | undefined;

async function mountFunnel(data: Record<string, unknown> = REAL_DATA) {
  apiBasePost.mockResolvedValue({ status: 200, data });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ConversionFunnel);
  app.mount(host);
  await nextTick();
  await Promise.resolve();
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  apiBasePost.mockReset();
});

describe('转化漏斗新可视化', () => {
  it('用四段独立总人数一眼展示转化变化', async () => {
    const host = await mountFunnel();
    const steps = [...host.querySelectorAll('.funnel-chain__step')];

    expect(steps).toHaveLength(4);
    expect(steps[0].textContent).toContain('访问580');
    expect(steps[1].textContent).toContain('打开注册192');
    expect(steps[1].textContent).toContain('72.9%');
    expect(steps[1].textContent).toContain('较上步少 52 人');
    expect(steps[3].textContent).toContain('注册成功115');
    expect(steps[3].textContent).toContain('其中完整路径 96 人');
  });

  it('用实色描边和文字标记最弱转化环节', async () => {
    const host = await mountFunnel();
    const weak = host.querySelector('.funnel-chain__step.is-weak');

    expect(weak?.textContent).toContain('打开注册');
    expect(weak?.textContent).toContain('主要流失环节');
  });

  it('并列展示打开注册与注册成功的入口构成', async () => {
    const host = await mountFunnel();
    const comparisons = [...host.querySelectorAll('.funnel-parallel__item')];

    expect(comparisons).toHaveLength(2);
    expect(comparisons[0].textContent).toContain('打开注册合计 192');
    expect(comparisons[0].textContent).toContain('看过示例18 · 9.4%');
    expect(comparisons[0].textContent).toContain('直接进入174 · 90.6%');
    expect(comparisons[1].textContent).toContain('注册成功合计 115');
  });

  it('诊断指标使用正确的独立分子分母', async () => {
    const host = await mountFunnel();
    const cards = [...host.querySelectorAll('.admin-stat-card')];
    const demo = cards.find((item) => item.textContent?.includes('示例到注册意图'));
    const wall = cards.find((item) => item.textContent?.includes('撞墙后产生注册意图'));

    expect(demo?.textContent).toContain('25%');
    expect(demo?.textContent).toContain('18 / 72 人');
    expect(wall?.textContent).toContain('42.4%');
    expect(wall?.textContent).toContain('28 / 66 人');
    expect(wall?.textContent).not.toContain('290.9');
  });

  it('明确区分独立总人数与完整时序路径', async () => {
    const host = await mountFunnel();
    const summary = host.querySelector('.funnel-chain__summary');

    expect(summary?.textContent).toContain('独立去重总人数');
    expect(summary?.textContent).toContain('不会替代真实注册数');
  });

  it('注册总数为 4 时主卡显示 4，完整路径 2 只作为辅助诊断', async () => {
    const host = await mountFunnel({
      ...REAL_DATA,
      pageViewVisitors: 28,
      signupOpenVisitors: 8,
      signupSubmitVisitors: 4,
      registerVisitors: 4,
      orderedFunnel: [{ key: 'registerSuccess', label: '注册成功', count: 2, fromPreviousRate: 50, lost: 2 }],
    });

    const registerStep = [...host.querySelectorAll('.funnel-chain__step')].at(-1);
    expect(registerStep?.textContent).toContain('注册成功4');
    expect(registerStep?.textContent).toContain('其中完整路径 2 人');
  });

  it('兼容旧后端：旧 mainFunnel 作为完整路径，主数字仍用独立事件总量', async () => {
    const host = await mountFunnel({
      ...REAL_DATA,
      pageViewVisitors: 35,
      signupOpenVisitors: 10,
      signupSubmitVisitors: 4,
      registerVisitors: 4,
      orderedFunnel: undefined,
      mainFunnel: [
        { key: 'pageView', label: '访问', count: 35, fromPreviousRate: null, lost: null },
        { key: 'signupOpen', label: '打开注册', count: 10, fromPreviousRate: 28.6, lost: 25 },
        { key: 'signupSubmit', label: '提交注册', count: 4, fromPreviousRate: 40, lost: 6 },
        { key: 'registerSuccess', label: '注册成功', count: 2, fromPreviousRate: 50, lost: 2 },
      ],
    });

    const registerStep = [...host.querySelectorAll('.funnel-chain__step')].at(-1);
    expect(registerStep?.textContent).toContain('注册成功4');
    expect(registerStep?.textContent).toContain('其中完整路径 2 人');
  });

  it('旧后端未返回新字段时安全降级，不出现 NaN', async () => {
    const host = await mountFunnel({ pageViewVisitors: 10, signupOpenVisitors: 4, hotspots: [], trend: [] });

    expect(host.textContent).not.toContain('NaN');
    expect(host.querySelectorAll('.funnel-chain__step')).toHaveLength(4);
  });
});
