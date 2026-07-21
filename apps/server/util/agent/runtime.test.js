import { describe, expect, it, vi } from 'vitest';
import { createAgentDeadline, getAgentRuntimeLimits, mapWithConcurrency } from './runtime.js';

describe('Agent runtime limits', () => {
  it('工具并发最多为 4，deadline 有安全边界', () => {
    expect(getAgentRuntimeLimits({ AI_AGENT_TOOL_CONCURRENCY: '20' }).toolConcurrency).toBe(4);
    expect(getAgentRuntimeLimits({ AI_AGENT_HARD_DEADLINE_MS: '1000' }).hardMs).toBe(30_000);
  });

  it('mapWithConcurrency 保序且不会超过并发上限', async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return value * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBe(3);
  });

  it('硬 deadline 可取消全链路，软 deadline 只阻止扩展规划', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const onSoft = vi.fn();
    const deadline = createAgentDeadline({ controller, softMs: 100, hardMs: 200, onSoftDeadline: onSoft });
    await vi.advanceTimersByTimeAsync(100);
    expect(deadline.softExpired).toBe(true);
    expect(onSoft).toHaveBeenCalledOnce();
    expect(controller.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(controller.signal.aborted).toBe(true);
    expect(controller.signal.reason).toMatchObject({ code: 'AGENT_HARD_DEADLINE_EXCEEDED' });
    deadline.dispose();
    vi.useRealTimers();
  });
});
