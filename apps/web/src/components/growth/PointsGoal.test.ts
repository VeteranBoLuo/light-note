import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zh from '@/i18n/locales/zh-CN';
const api = vi.hoisted(() => ({ getPointsSummary: vi.fn(), updatePointsGoal: vi.fn() }));
vi.mock('@/api/growthApi.ts', () => ({ default: api }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));
import PointsGoal from './PointsGoal.vue';
let app: ReturnType<typeof createApp>;
let host: HTMLDivElement;
const data = {
  balance: 100,
  goal: {
    enabled: true,
    itemId: 'reward',
    item: { name: '测试商品' },
    price: 200,
    balance: 100,
    shortfall: 100,
    progress: 50,
  },
  goalOptions: [{ id: 'reward', name: '测试商品', cost: 200 }],
};
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}
async function mount(props = {}) {
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(PointsGoal, props);
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
  await flush();
}
beforeEach(() => {
  api.getPointsSummary.mockReset().mockResolvedValue({ status: 200, data });
  api.updatePointsGoal.mockReset();
});
afterEach(() => {
  app?.unmount();
  host?.remove();
});
describe('兑换目标', () => {
  it('关闭目标后读取服务端结果，不保留旧进度', async () => {
    api.updatePointsGoal.mockResolvedValue({ status: 200, data: { ok: true } });
    await mount();
    api.getPointsSummary.mockResolvedValue({ status: 200, data: { ...data, goal: { enabled: false } } });
    [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('关闭目标'))!.click();
    await flush();
    await flush();
    expect(api.updatePointsGoal).toHaveBeenCalledWith({ itemId: 'reward', enabled: false });
    expect(host.querySelector('.points-goal-progress')).toBeNull();
  });
  it('达到兑换上限的目标显示不可用，并隐藏差额与进度', async () => {
    await mount({ catalog: [{ id: 'reward', limitReached: true }] });
    expect(host.textContent).toContain(zh.growth.pointsCenterGoalUnavailable);
    expect(host.querySelector('.points-goal-meta')).toBeNull();
    expect(host.querySelector('.points-goal-progress .b-progress')).toBeNull();
  });
  it('管理员只读上下文禁止保存与关闭目标', async () => {
    await mount({ readOnly: true });
    const buttons = [...host.querySelectorAll('button')].filter((b) => /设为目标|关闭目标/.test(b.textContent || ''));
    expect(buttons.every((b) => b.disabled)).toBe(true);
    buttons.forEach((b) => b.click());
    await flush();
    expect(api.updatePointsGoal).not.toHaveBeenCalled();
  });
});
