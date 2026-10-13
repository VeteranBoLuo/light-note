import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, type EffectScope } from 'vue';
import { useTodoClock } from './useTodoClock';

const scopes: EffectScope[] = [];
function subscribe() {
  const scope = effectScope();
  scopes.push(scope);
  return { scope, clock: scope.run(() => useTodoClock())! };
}
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useTodoClock', () => {
  it('多条待办共用单一时钟，最后一个订阅销毁后清理', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T09:00:00'));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const first = subscribe();
    const second = subscribe();
    expect(vi.getTimerCount()).toBe(1);
    const before = first.clock.now.value;
    const day = first.clock.today.value;
    vi.advanceTimersByTime(1000);
    expect(first.clock.now.value).toBe(before + 1000);
    expect(second.clock.now.value).toBe(before + 1000);
    expect(first.clock.today.value).toBe(day);
    first.scope.stop();
    expect(vi.getTimerCount()).toBe(1);
    second.scope.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('后台停止计时，回前台立即校准跨日时间，卸载后不再响应事件', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T23:59:59'));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const { scope, clock } = subscribe();
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(new Date('2026-10-14T09:00:00'));
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clock.now.value).toBe(Date.now());
    expect(clock.today.value.getDate()).toBe(14);
    expect(vi.getTimerCount()).toBe(1);
    scope.stop();
    const stopped = clock.now.value;
    vi.setSystemTime(new Date('2026-10-15T09:00:00'));
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(clock.now.value).toBe(stopped);
    expect(vi.getTimerCount()).toBe(0);
  });
});
