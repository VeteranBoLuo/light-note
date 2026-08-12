import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';

const mocks = vi.hoisted(() => ({
  draw: vi.fn(() => new Promise(() => {})),
  loadLottery: vi.fn(),
  recordOperation: vi.fn(),
}));

vi.mock('@/store', () => ({
  useUserStore: () => ({ id: 'user-1' }),
}));

vi.mock('@/composables/useGrowth.ts', async () => {
  const { ref } = await import('vue');
  return {
    useGrowth: () => ({
      lottery: ref({
        points: 1000,
        level: 15,
        singleCost: 88,
        tenCost: 800,
        freeDaily: 0,
        freeRemaining: 0,
        pityEvery: 10,
        toPity: 3,
        pool: [],
      }),
      lotteryLoading: ref(false),
      loadLottery: mocks.loadLottery,
      draw: mocks.draw,
    }),
  };
});

vi.mock('@/api/commonApi.ts', () => ({
  recordOperation: mocks.recordOperation,
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', render: () => h('span', { class: 'svg-icon-stub', 'aria-hidden': 'true' }) },
}));

import LotteryDraw from './LotteryDraw.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  mocks.draw.mockClear();
  mocks.loadLottery.mockClear();
});

describe('LotteryDraw 开奖定位', () => {
  it('点击单抽时通知成长页定位抽奖标题，不再由舞台自行滚动', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onFocusHeader = vi.fn();
    const app = createApp({
      render: () => h(LotteryDraw, { onFocusHeader }),
    });
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': {} },
        missingWarn: false,
        fallbackWarn: false,
      }),
    );
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    await nextTick();
    const drawOne = host.querySelector<HTMLButtonElement>('.lt-draw-button--paid:not(.lt-draw-button--ten)');
    expect(drawOne?.disabled).toBe(false);
    drawOne?.click();
    await nextTick();

    expect(onFocusHeader).toHaveBeenCalledTimes(1);
    expect(mocks.draw).toHaveBeenCalledWith(1, false);
  });
});
