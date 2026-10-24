import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/i18n/locales/zh-CN';
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => h('span') } }));
const api = vi.hoisted(() => ({ getPointsSummary: vi.fn(), updatePointsGoal: vi.fn() }));
vi.mock('@/api/growthApi.ts', () => ({ default: api }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
import PointsGoal from './PointsGoal.vue';
let app: ReturnType<typeof createApp>;
let host: HTMLDivElement;
let props: Record<string, any>;
const redeem = vi.fn();
function summary() {
  return {
    balance: 100,
    lowPressureMode: false,
    goal: {
      enabled: true,
      itemId: 'reward',
      item: { id: 'reward', name: '测试商品', cost: 200 },
      price: 200,
      balance: 100,
      shortfall: 100,
      progress: 50,
      estimate: { minDays: 3, maxDays: 5 },
    },
    goalOptions: [
      { id: 'reward', name: '测试商品', cost: 200 },
      { id: 'other', name: '另一件商品', cost: 300 },
    ],
  };
}
async function flush() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    await nextTick();
  }
}
async function mount(overrides = {}) {
  host = document.createElement('div');
  document.body.append(host);
  props = reactive(overrides);
  app = createApp({ render: () => h(PointsGoal, { ...props, onRedeem: redeem }) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
  await flush();
}
function button(text: string) {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  expect(found, `Missing button: ${text}`).toBeTruthy();
  return found!;
}
async function chooseOther() {
  button(zh.growth.pointsCenterGoalChange).click();
  await flush();
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((el) =>
    el.textContent?.includes('另一件商品'),
  );
  expect(option).toBeTruthy();
  option!.click();
  await flush();
}
beforeEach(() => {
  api.getPointsSummary.mockReset().mockResolvedValue({ status: 200, data: summary() });
  api.updatePointsGoal.mockReset();
  redeem.mockReset();
});
afterEach(() => {
  app?.unmount();
  host?.remove();
});
describe('兑换目标', () => {
  it('已保存目标默认展示进度与用途说明，选择表单按需打开', async () => {
    await mount();
    expect(host.textContent).toContain('暂无达成提醒');
    expect(host.textContent).toContain('还差 100 积分');
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('50');
    expect(host.querySelector('[role="combobox"]')).toBeNull();
    expect(host.textContent).toContain('约 3～5 天');
    button(zh.growth.pointsCenterGoalChange).click();
    await flush();
    expect(host.querySelector('[role="combobox"]')).toBeTruthy();
  });
  it('未设置时提供明确入口，不展示空进度或常驻表单', async () => {
    api.getPointsSummary.mockResolvedValue({ status: 200, data: { ...summary(), goal: { enabled: false } } });
    await mount();
    expect(host.querySelector('[role="combobox"]')).toBeNull();
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    button(zh.growth.pointsCenterGoalSet).click();
    await flush();
    expect(host.querySelector('[role="combobox"]')).toBeTruthy();
    expect(button(zh.growth.pointsCenterGoalSave).disabled).toBe(true);
  });
  it('更换草稿后取消，保留已保存目标且不发写请求', async () => {
    await mount();
    await chooseOther();
    button(zh.common.cancel).click();
    await flush();
    expect(host.textContent).toContain('测试商品');
    expect(host.textContent).not.toContain('另一件商品');
    expect(host.querySelector('[role="combobox"]')).toBeNull();
    expect(document.activeElement).toBe(button(zh.growth.pointsCenterGoalChange));
    expect(api.updatePointsGoal).not.toHaveBeenCalled();
  });
  it('保存后读取服务端结果并收起表单', async () => {
    await mount();
    await chooseOther();
    const next = summary();
    next.goal = { ...next.goal, itemId: 'other', item: { id: 'other', name: '另一件商品', cost: 300 }, price: 300 };
    api.updatePointsGoal.mockResolvedValue({ status: 200, data: { ok: true } });
    api.getPointsSummary.mockResolvedValue({ status: 200, data: next });
    button(zh.growth.pointsCenterGoalSave).click();
    await flush();
    expect(api.updatePointsGoal).toHaveBeenCalledWith({ itemId: 'other', enabled: true });
    expect(host.querySelector('[role="combobox"]')).toBeNull();
    expect(host.querySelector('.points-goal-product')?.textContent).toContain('另一件商品');
  });
  it('保存失败保留草稿和表单，允许重试', async () => {
    await mount();
    await chooseOther();
    api.updatePointsGoal.mockRejectedValue(new Error('fixture failure'));
    button(zh.growth.pointsCenterGoalSave).click();
    await flush();
    expect(host.querySelector('[role="combobox"]')).toBeTruthy();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(zh.growth.pointsCenterGoalSaveFailed);
    expect(button(zh.growth.pointsCenterGoalSave).disabled).toBe(false);
    expect(api.updatePointsGoal).toHaveBeenCalledWith({ itemId: 'other', enabled: true });
  });
  it('关闭目标后读取服务端结果，不保留旧进度', async () => {
    api.updatePointsGoal.mockResolvedValue({ status: 200, data: { ok: true } });
    await mount();
    api.getPointsSummary.mockResolvedValue({ status: 200, data: { ...summary(), goal: { enabled: false } } });
    button(zh.growth.pointsCenterGoalDisable).click();
    await flush();
    expect(api.updatePointsGoal).toHaveBeenCalledWith({ itemId: 'reward', enabled: false });
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    expect(button(zh.growth.pointsCenterGoalSet)).toBeTruthy();
  });
  it('关闭失败也显示错误，保留当前目标', async () => {
    api.updatePointsGoal.mockRejectedValue(new Error('fixture failure'));
    await mount();
    button(zh.growth.pointsCenterGoalDisable).click();
    await flush();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(zh.growth.pointsCenterGoalSaveFailed);
    expect(host.querySelector('[role="progressbar"]')).toBeTruthy();
  });
  it('积分攒够后显示明确反馈并隐藏差额和预计天数，导航只发定位事件', async () => {
    await mount({ balance: 250 });
    expect(host.textContent).toContain(zh.growth.pointsCenterGoalReached);
    expect(host.textContent).not.toContain('还差');
    expect(host.textContent).not.toContain('约 3～5 天');
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('100');
    button(zh.growth.pointsCenterGoalRedeem).click();
    expect(redeem).toHaveBeenCalledWith('reward');
    expect(api.updatePointsGoal).not.toHaveBeenCalled();
  });
  it('余额变化时进度立即更新，不继续显示旧余额的预计时间', async () => {
    await mount({ balance: 100 });
    props.balance = 150;
    await flush();
    expect(host.textContent).toContain('还差 50 积分');
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('75');
    expect(host.textContent).not.toContain('约 3～5 天');
  });
  it('低打扰模式隐藏预计天数并保留进度', async () => {
    api.getPointsSummary.mockResolvedValue({ status: 200, data: { ...summary(), lowPressureMode: true } });
    await mount();
    expect(host.textContent).toContain(zh.growth.pointsCenterGoalLowPressure);
    expect(host.textContent).not.toContain('约 3～5 天');
    expect(host.querySelector('[role="progressbar"]')).toBeTruthy();
  });
  it('达到兑换上限的目标显示不可用，并隐藏差额与进度', async () => {
    await mount({ catalog: [{ id: 'reward', name: '测试商品', limitReached: true }], balance: 250 });
    expect(host.textContent).toContain(zh.growth.pointsCenterGoalUnavailable);
    expect(host.querySelector('.points-goal-meta')).toBeNull();
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    expect(host.textContent).not.toContain(zh.growth.pointsCenterGoalReached);
  });
  it('目标缺少有效价格时不显示零差额或可兑换状态', async () => {
    const next = summary();
    next.goal.price = 0;
    api.getPointsSummary.mockResolvedValue({ status: 200, data: next });
    await mount();
    expect(host.textContent).toContain(zh.growth.pointsCenterGoalUnavailable);
    expect(host.querySelector('[role="progressbar"]')).toBeNull();
    expect(host.textContent).not.toContain(zh.growth.pointsCenterGoalReached);
  });
  it.each([
    { readOnly: true },
    { purchaseEnabled: false },
    { catalog: [{ id: 'reward', name: '测试商品', cost: 200, minLevel: 8 }], level: 3 },
  ])('积分足够也继续遵守兑换限制 %j', async (restriction) => {
    await mount({ balance: 250, ...restriction });
    expect(button(zh.growth.pointsCenterGoalRedeem).disabled).toBe(true);
    button(zh.growth.pointsCenterGoalRedeem).click();
    expect(redeem).not.toHaveBeenCalled();
  });
  it('管理员只读上下文禁止保存与关闭目标', async () => {
    await mount({ readOnly: true });
    expect(button(zh.growth.pointsCenterGoalChange).disabled).toBe(true);
    expect(button(zh.growth.pointsCenterGoalDisable).disabled).toBe(true);
    button(zh.growth.pointsCenterGoalChange).click();
    button(zh.growth.pointsCenterGoalDisable).click();
    await flush();
    expect(host.querySelector('[role="combobox"]')).toBeNull();
    expect(api.updatePointsGoal).not.toHaveBeenCalled();
  });
  it('加载失败可重试，失败不伪装成未设置', async () => {
    api.getPointsSummary.mockRejectedValueOnce(new Error('fixture failure'));
    await mount();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(zh.growth.pointsCenterLoadFailed);
    expect(host.textContent).not.toContain(zh.growth.pointsCenterGoalEmpty);
    button(zh.common.retry).click();
    await flush();
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.querySelector('[role="progressbar"]')).toBeTruthy();
  });
});
