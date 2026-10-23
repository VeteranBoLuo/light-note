import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import zh from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({ draw: vi.fn(), loadLottery: vi.fn(), status: null as any }));
vi.mock('@/store', () => ({
  useUserStore: () => ({ id: 'user-1', adminContext: null }),
  bookmarkStore: () => ({ isMobile: false, isMobileDevice: false }),
}));
vi.mock('@/composables/useGrowth', async () => {
  const { ref } = await import('vue');
  return {
    useGrowth: () => ({
      lottery: ref(mocks.status),
      lotteryError: ref(false),
      loadLottery: mocks.loadLottery,
      draw: mocks.draw,
    }),
  };
});
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('./LotteryRecords.vue', () => ({
  default: {
    render: () => h('div'),
    setup: (_: unknown, { expose }: any) => {
      expose({ open: vi.fn() });
    },
  },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => h('span') } }));
import LotteryDraw from './LotteryDraw.vue';

let cleanup: (() => void) | undefined;
async function mount(readOnly = false) {
  const host = document.createElement('div');
  document.body.append(host);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/growth', component: { render: () => null } }],
  });
  await router.push('/growth');
  const onFocusHeader = vi.fn();
  const app = createApp({ render: () => h(LotteryDraw, { readOnly, onFocusHeader }) });
  app.use(router).use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await nextTick();
  return { host, onFocusHeader };
}
const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};
beforeEach(() => {
  mocks.draw.mockReset();
  mocks.loadLottery.mockClear();
  mocks.status = {
    points: 3817,
    level: 15,
    free: {
      enabled: true,
      daily: 3,
      remaining: 2,
      countsPaidPity: false,
      pool: [
        { id: 'ai100', kind: 'ai_pack', amount: 100000, rate: 8 },
        { id: 'ai200', kind: 'ai_pack', amount: 200000, rate: 2 },
      ],
    },
    paid: {
      enabled: true,
      singleCost: 170,
      tenCost: 1600,
      pityEvery: 10,
      toPity: 2,
      pool: [{ id: 'ai', kind: 'ai_pack', amount: 600000, rate: 8, rare: true, pityRate: 47.06 }],
    },
  };
});
afterEach(() => {
  cleanup?.();
});

describe('方案 A 抽取模式与到账反馈', () => {
  it('默认每日惊喜展示两档 AI 数量，隐藏积分操作与保底', async () => {
    const { host } = await mount();
    expect(host.textContent).toContain('AI 额度 +10 万 tokens');
    expect(host.textContent).toContain('AI 额度 +20 万 tokens');
    expect(host.querySelector('.lt-draw-button--paid')).toBeNull();
    expect(host.querySelector('.lt-pity-panel')).toBeNull();
  });
  it('切换积分抽奖时奖池、价格、操作和保底一起切换', async () => {
    const { host, onFocusHeader } = await mount();
    host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    await nextTick();
    expect(host.textContent).toContain('AI 额度 +60 万 tokens');
    expect(host.querySelector('.lt-draw-button--free')).toBeNull();
    expect(host.querySelector('.lt-pity-panel')).not.toBeNull();
    expect(host.querySelector('.lt-draw-button--ten')?.textContent).toContain('1,600');
    mocks.draw.mockReturnValue(new Promise(() => {}));
    host.querySelector<HTMLButtonElement>('.lt-draw-button--paid')!.click();
    await nextTick();
    expect(mocks.draw).toHaveBeenCalledWith(1, false);
    expect(onFocusHeader).toHaveBeenCalledOnce();
    expect(host.querySelector<HTMLButtonElement>('.lt-draw-button--ten')!.disabled).toBe(true);
  });
  it('AI 中奖后明确永久余额去向，并保留查看背包入口', async () => {
    mocks.draw.mockResolvedValue({
      status: 200,
      data: { ok: true, cost: 0, results: [{ id: 'ai100', kind: 'ai_pack', amount: 100000 }] },
    });
    const { host } = await mount();
    host.querySelector<HTMLButtonElement>('.lt-draw-button--free')!.click();
    await flush();
    expect(mocks.draw).toHaveBeenCalledWith(1, true);
    expect(host.querySelector('.lt-stage')!.textContent).toContain('AI 额度 +10 万 tokens');
    expect(host.querySelector('.lt-stage')!.textContent).toContain('已计入永久余额，无需领取');
    expect(host.querySelector('.lt-stage')!.textContent).toContain('查看背包');
  });
  it('免费次数用完与管理员只读均不能发起抽奖', async () => {
    mocks.status.free.remaining = 0;
    const { host } = await mount(true);
    host.querySelector<HTMLButtonElement>('.lt-draw-button--free')!.click();
    expect(host.textContent).toContain('今日免费次数已用完');
    expect(mocks.draw).not.toHaveBeenCalled();
    host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    await nextTick();
    expect(host.querySelector<HTMLButtonElement>('.lt-draw-button--paid')!.disabled).toBe(true);
  });
});
