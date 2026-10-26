import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import type { LotteryPrize } from '@/composables/useGrowth';
import { LOTTERY_CARD_MS, LOTTERY_CHARGE_MS, LOTTERY_STAGGER_MS, useLotteryReveal } from './useLotteryReveal';

let scope: EffectScope;
let hidden = false;
let onMediaChange: () => void;
const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
const prizes = (count = 1) =>
  Array.from({ length: count }, (_, i) => ({ id: `prize-${i}`, kind: 'points', amount: 20 }) as LotteryPrize);
const setup = () => scope.run(useLotteryReveal)!;
beforeEach(() => {
  vi.useFakeTimers();
  scope = effectScope();
  hidden = false;
  media.matches = false;
  media.addEventListener.mockClear();
  media.removeEventListener.mockClear();
  media.addEventListener.mockImplementation((_, handler) => {
    onMediaChange = handler;
  });
  vi.stubGlobal('matchMedia', () => media);
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
});
afterEach(() => {
  scope.stop();
  document.documentElement.classList.remove('disable-animations');
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('抽奖收据与揭晓节奏', () => {
  it('快速收据先完成礼盒前奏，再揭晓并解锁操作', async () => {
    const reveal = setup();
    reveal.begin();
    reveal.accept(prizes());
    expect(reveal.phase.value).toBe('charging');
    expect(reveal.busy.value).toBe(true);
    await vi.advanceTimersByTimeAsync(LOTTERY_CHARGE_MS);
    expect(reveal.phase.value).toBe('revealing');
    await vi.advanceTimersByTimeAsync(LOTTERY_CARD_MS + 80);
    expect(reveal.phase.value).toBe('result');
    expect(reveal.busy.value).toBe(false);
  });
  it('慢请求停止前奏等待收据，收据到达后不重复播放前奏', async () => {
    const reveal = setup();
    reveal.begin();
    await vi.advanceTimersByTimeAsync(5000);
    expect(reveal.phase.value).toBe('waiting');
    expect(reveal.results.value).toEqual([]);
    reveal.accept(prizes());
    expect(reveal.phase.value).toBe('revealing');
  });
  it('跳过动画仍保持请求锁，不能在收据到达前展示奖励', async () => {
    const reveal = setup();
    reveal.begin();
    reveal.skip();
    await vi.advanceTimersByTimeAsync(10000);
    expect(reveal.phase.value).toBe('waiting');
    expect(reveal.busy.value).toBe(true);
    expect(reveal.results.value).toHaveLength(0);
    reveal.accept(prizes());
    expect(reveal.phase.value).toBe('result');
    expect(reveal.busy.value).toBe(false);
  });
  it('十连按收据顺序保留全部奖励，逐张揭晓期间保持锁定', async () => {
    const reveal = setup();
    const receipt = prizes(10);
    reveal.begin();
    reveal.accept(receipt);
    await vi.advanceTimersByTimeAsync(LOTTERY_CHARGE_MS + LOTTERY_CARD_MS);
    expect(reveal.phase.value).toBe('revealing');
    expect(reveal.results.value.map((prize) => prize.id)).toEqual(receipt.map((prize) => prize.id));
    await vi.advanceTimersByTimeAsync(9 * LOTTERY_STAGGER_MS + 80);
    expect(reveal.phase.value).toBe('result');
  });
  it('十连中途跳过立即展示全部收据，不留下延迟回调', async () => {
    const reveal = setup();
    reveal.begin();
    reveal.accept(prizes(10));
    await vi.advanceTimersByTimeAsync(LOTTERY_CHARGE_MS + 300);
    reveal.skip();
    expect(reveal.phase.value).toBe('result');
    expect(reveal.results.value).toHaveLength(10);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('系统减少动画时只等待真实收据', () => {
    media.matches = true;
    const reveal = setup();
    reveal.begin();
    expect(reveal.phase.value).toBe('waiting');
    expect(vi.getTimerCount()).toBe(0);
    reveal.accept(prizes());
    expect(reveal.phase.value).toBe('result');
  });
  it('播放中开启减少动画会停止运动，收据到达后直接展示', () => {
    const reveal = setup();
    reveal.begin();
    media.matches = true;
    onMediaChange();
    expect(reveal.phase.value).toBe('waiting');
    reveal.accept(prizes());
    expect(reveal.phase.value).toBe('result');
  });
  it('全局关闭动画也会结束揭晓，而非隐藏已经到账的结果', async () => {
    const reveal = setup();
    reveal.begin();
    reveal.accept(prizes());
    document.documentElement.classList.add('disable-animations');
    await vi.advanceTimersByTimeAsync(0);
    expect(reveal.motionReduced.value).toBe(true);
    expect(reveal.phase.value).toBe('result');
  });
  it('切到后台会跳过展示，恢复页面后不重放动画', () => {
    const reveal = setup();
    reveal.begin();
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    reveal.accept(prizes());
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(reveal.phase.value).toBe('result');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('账号重置或组件卸载后，迟到收据不能重新开启旧动画', async () => {
    const reveal = setup();
    reveal.begin();
    reveal.reset();
    reveal.accept(prizes());
    expect(reveal.phase.value).toBe('idle');
    reveal.begin();
    scope.stop();
    reveal.accept(prizes());
    await vi.advanceTimersByTimeAsync(10000);
    expect(reveal.phase.value).toBe('idle');
    expect(reveal.results.value).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(media.removeEventListener).toHaveBeenCalled();
  });
  it('空收据与未知结果都不能制造中奖结果，恢复请求可重新开始', () => {
    const reveal = setup();
    reveal.begin();
    reveal.accept([]);
    expect(reveal.phase.value).toBe('uncertain');
    expect(reveal.results.value).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    reveal.begin();
    reveal.uncertain();
    expect(reveal.phase.value).toBe('uncertain');
    expect(reveal.busy.value).toBe(false);
  });
});
