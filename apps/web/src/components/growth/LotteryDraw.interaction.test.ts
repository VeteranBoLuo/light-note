import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import zh from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  draw: vi.fn(),
  loadLottery: vi.fn(),
  record: vi.fn(),
  status: null as any,
  state: null as any,
  user: null as any,
}));
vi.mock('@/store', async () => {
  const { reactive } = await import('vue');
  mocks.user = reactive({ id: 'user-1', adminContext: null });
  return { useUserStore: () => mocks.user, bookmarkStore: () => ({ isMobile: false, isMobileDevice: false }) };
});
vi.mock('@/composables/useGrowth', async () => {
  const { ref } = await import('vue');
  return {
    useGrowth: () => ({
      lottery: (mocks.state = ref(mocks.status)),
      lotteryError: ref(false),
      loadLottery: mocks.loadLottery,
      draw: mocks.draw,
    }),
  };
});
vi.mock('@/api/commonApi', () => ({ recordOperation: mocks.record }));
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
import { LOTTERY_CHARGE_MS, LOTTERY_CARD_MS } from './useLotteryReveal';

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
  await vi.advanceTimersByTimeAsync(0);
  await nextTick();
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  mocks.user.id = 'user-1';
  mocks.draw.mockReset();
  mocks.record.mockClear();
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
  cleanup = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
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
    expect(host.querySelector('[role="listitem"]')).toBeNull();
    await vi.advanceTimersByTimeAsync(LOTTERY_CHARGE_MS + LOTTERY_CARD_MS + 80);
    expect(host.querySelector('[role="listitem"]')?.getAttribute('aria-label')).toBe('AI 额度 +10 万 tokens');
    expect(host.querySelector('.lt-stage')!.textContent).toContain('已计入永久余额，无需领取');
    expect(host.querySelector('.lt-stage')!.textContent).toContain('查看背包');
  });
  it('跳过等待仍只发一次请求，收据确认前不能显示已到账', async () => {
    let resolve!: (value: unknown) => void;
    mocks.draw.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { host } = await mount();
    const button = host.querySelector<HTMLButtonElement>('.lt-draw-button--free')!;
    button.click();
    button.click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('.lt-skip')!.click();
    await nextTick();
    expect(host.querySelector('.lt-stage')!.textContent).toContain('正在确认抽奖结果');
    expect(host.querySelector('[role="listitem"]')).toBeNull();
    expect(button.disabled).toBe(true);
    expect(mocks.draw).toHaveBeenCalledTimes(1);
    resolve({ status: 200, data: { ok: true, cost: 0, results: [{ id: 'p20', kind: 'points', amount: 20 }] } });
    await flush();
    expect(host.querySelector('[role="listitem"]')?.getAttribute('aria-label')).toBe('+20 积分');
    expect(button.disabled).toBe(false);
    expect(mocks.draw).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });
  it('十连揭晓中可跳过并保留全部奖励和真实保底标识', async () => {
    mocks.draw.mockResolvedValue({
      status: 200,
      data: {
        ok: true,
        cost: 1600,
        results: Array.from({ length: 10 }, (_, i) => ({
          id: String(i),
          kind: 'points',
          amount: 20,
          guaranteed: i === 9,
        })),
      },
    });
    const { host } = await mount();
    host.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click();
    await nextTick();
    host.querySelector<HTMLButtonElement>('.lt-draw-button--ten')!.click();
    await flush();
    await vi.advanceTimersByTimeAsync(LOTTERY_CHARGE_MS + 100);
    expect(host.querySelectorAll('[role="listitem"]')).toHaveLength(10);
    expect(host.querySelector('.lt-stage')!.textContent).toContain('正在揭晓 10 份奖励');
    host.querySelector<HTMLButtonElement>('.lt-skip')!.click();
    await nextTick();
    expect(host.querySelectorAll('[role="listitem"]')).toHaveLength(10);
    expect(host.querySelector('.lt-stage')!.textContent).toContain('保底命中');
    expect(host.querySelector('.lt-stage')!.textContent).toContain('本次获得 10 份奖励');
    expect(mocks.draw).toHaveBeenCalledTimes(1);
  });
  it.each(['network', 'pending'])('结果未知时只确认原抽奖，即使余额或次数已经变化：%s', async (failure) => {
    if (failure === 'network') mocks.draw.mockRejectedValueOnce({ code: 'ERR_NETWORK' });
    else mocks.draw.mockResolvedValueOnce({ status: 409, data: { code: 'IDEMPOTENCY_RESULT_PENDING' } });
    mocks.draw.mockResolvedValueOnce({
      status: 200,
      data: { ok: true, cost: 0, results: [{ id: 'ai', kind: 'ai_pack', amount: 100000 }] },
    });
    const { host } = await mount();
    host.querySelector<HTMLButtonElement>('.lt-draw-button--free')!.click();
    await flush();
    mocks.state.value.free.remaining = 0;
    mocks.state.value.points = 0;
    await nextTick();
    expect(host.querySelector('[role="listitem"]')).toBeNull();
    expect(host.querySelector('.lt-stage')!.textContent).toContain('抽奖结果待确认');
    const retry = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === '重试确认结果',
    )!;
    expect(retry.disabled).toBe(false);
    retry.click();
    await flush();
    await vi.advanceTimersByTimeAsync(LOTTERY_CHARGE_MS + LOTTERY_CARD_MS + 80);
    expect(mocks.draw.mock.calls).toEqual([
      [1, true],
      [1, true],
    ]);
    expect(host.querySelector('[role="listitem"]')?.getAttribute('aria-label')).toBe('AI 额度 +10 万 tokens');
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });
  it('已知失败恢复操作并显示错误，不播放中奖结果或记录成功', async () => {
    mocks.draw.mockResolvedValue({ status: 409, data: { refresh: true } });
    const { host } = await mount();
    host.querySelector<HTMLButtonElement>('.lt-draw-button--free')!.click();
    await flush();
    await vi.advanceTimersByTimeAsync(10000);
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector('[role="listitem"]')).toBeNull();
    expect(host.querySelector<HTMLButtonElement>('.lt-draw-button--free')!.disabled).toBe(false);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it('账号变化后忽略旧账号的迟到收据', async () => {
    let resolve!: (value: unknown) => void;
    mocks.draw.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { host } = await mount();
    host.querySelector<HTMLButtonElement>('.lt-draw-button--free')!.click();
    await nextTick();
    mocks.user.id = 'user-2';
    await nextTick();
    resolve({ status: 200, data: { ok: true, cost: 0, results: [{ id: 'ai', kind: 'ai_pack', amount: 100000 }] } });
    await flush();
    await vi.advanceTimersByTimeAsync(10000);
    expect(host.querySelector('[role="listitem"]')).toBeNull();
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it('成功但缺少奖励收据时引导查看记录，不以重试发起新的扣费', async () => {
    mocks.draw.mockResolvedValue({ status: 200, data: { ok: true, cost: 0, results: [] } });
    const { host } = await mount();
    host.querySelector<HTMLButtonElement>('.lt-draw-button--free')!.click();
    await flush();
    expect(host.querySelector('.lt-stage')!.textContent).toContain('请在抽奖记录中查看本次实际奖励');
    expect(host.querySelector('.lt-stage')!.textContent).not.toContain('重试确认结果');
    expect(host.querySelector('[role="listitem"]')).toBeNull();
    expect(mocks.draw).toHaveBeenCalledTimes(1);
  });
  it('免费抽取期间权益刷新不会把正在揭晓的结果切到积分奖池', async () => {
    mocks.draw.mockResolvedValue({
      status: 200,
      data: { ok: true, cost: 0, results: [{ id: 'ai', kind: 'ai_pack', amount: 100000 }] },
    });
    const { host } = await mount();
    host.querySelector<HTMLButtonElement>('.lt-draw-button--free')!.click();
    await flush();
    mocks.state.value.free.daily = 0;
    await nextTick();
    expect(host.querySelector('.lt-draw-button--free')?.textContent).toContain('免费抽一次');
    await vi.advanceTimersByTimeAsync(LOTTERY_CHARGE_MS + LOTTERY_CARD_MS + 80);
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('每日惊喜');
    expect(host.querySelector('[role="listitem"]')?.getAttribute('aria-label')).toBe('AI 额度 +10 万 tokens');
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
