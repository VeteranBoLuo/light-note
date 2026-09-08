import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUserActivityRuntime, ACTIVITY_GRACE_MS } from './userActivityRuntime';

function surface() {
  const docEvents = new Map<string, EventListener>();
  const winEvents = new Map<string, EventListener>();
  const doc = {
    visibilityState: 'visible',
    hasFocus: () => true,
    addEventListener: (key: string, fn: EventListener) => docEvents.set(key, fn),
    removeEventListener: (key: string) => docEvents.delete(key),
  };
  const win = {
    navigator: {},
    PointerEvent: class {},
    addEventListener: (key: string, fn: EventListener) => winEvents.set(key, fn),
    removeEventListener: (key: string) => winEvents.delete(key),
  };
  return {
    doc,
    win,
    docEvents,
    input: (type = 'pointerdown', trusted = true) => docEvents.get(type)?.({ type, isTrusted: trusted } as Event),
    blur: () => winEvents.get('blur')?.({} as Event),
  };
}
const runtimes: ReturnType<typeof createUserActivityRuntime>[] = [];
function setup(report = vi.fn().mockResolvedValue(true), target = surface()) {
  const runtime = createUserActivityRuntime({
    report,
    doc: target.doc as unknown as Document,
    win: target.win as unknown as Window,
    random: () => 0,
  });
  runtime.setOwner('user-a');
  runtimes.push(runtime);
  return { runtime, report, ...target };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T12:00:00+08:00'));
});
afterEach(() => {
  runtimes.splice(0).forEach((r) => r.dispose());
  vi.useRealTimers();
});
describe('real user activity runtime', () => {
  it('idle, programmatic events and unrelated automatic requests never report', async () => {
    const ctx = setup();
    ctx.input('pointerdown', false);
    ctx.input('scroll');
    ctx.input('mousemove');
    await vi.advanceTimersByTimeAsync(600_000);
    expect(ctx.report).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('10,000 input events schedule one report without reactive state or per-event timers', async () => {
    const ctx = setup();
    for (let i = 0; i < 10_000; i++) ctx.input(i % 2 ? 'wheel' : 'keydown');
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.report).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ACTIVITY_GRACE_MS);
    expect(ctx.report).toHaveBeenCalledTimes(5);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('hidden/blurred pages must receive a fresh interaction after returning', async () => {
    const ctx = setup();
    ctx.input();
    await vi.advanceTimersByTimeAsync(0);
    ctx.blur();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ctx.report).toHaveBeenCalledTimes(1);
    ctx.input();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.report).toHaveBeenCalledTimes(2);
    ctx.doc.visibilityState = 'hidden';
    ctx.docEvents.get('visibilitychange')?.({} as Event);
    await vi.advanceTimersByTimeAsync(120_000);
    ctx.doc.visibilityState = 'visible';
    ctx.docEvents.get('visibilitychange')?.({} as Event);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ctx.report).toHaveBeenCalledTimes(2);
  });
  it('failures do not retry on every input, and account changes discard pending receipts', async () => {
    const report = vi.fn().mockRejectedValue(new Error('offline'));
    const ctx = setup(report);
    ctx.input();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 1000; i++) ctx.input();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(report).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(report).toHaveBeenCalledTimes(2);
    ctx.runtime.setOwner('');
    ctx.input();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(report).toHaveBeenCalledTimes(2);
  });
  it('crossing Beijing midnight records the new day only while still eligible', async () => {
    vi.setSystemTime(new Date('2026-09-08T23:59:40+08:00'));
    const ctx = setup();
    ctx.input();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(ctx.report).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(ctx.report).toHaveBeenCalledTimes(5);
  });
  it('touch fallback is supported without subscribing to mouse movement', async () => {
    const target = surface();
    delete (target.win as any).PointerEvent;
    const ctx = setup(vi.fn().mockResolvedValue(true), target);
    expect(ctx.docEvents.has('pointerdown')).toBe(false);
    ctx.input('touchstart');
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.report).toHaveBeenCalledTimes(1);
  });
  it('shares successful receipts without granting another tab reading eligibility', async () => {
    const channels: any[] = [];
    class Channel {
      onmessage?: (e: any) => void;
      constructor() {
        channels.push(this);
      }
      postMessage(data: any) {
        channels.filter((c) => c !== this).forEach((c) => c.onmessage?.({ data }));
      }
      close() {}
    }
    const a = surface(),
      b = surface();
    Object.assign(a.win, { BroadcastChannel: Channel });
    Object.assign(b.win, { BroadcastChannel: Channel });
    const first = setup(vi.fn().mockResolvedValue(true), a),
      second = setup(vi.fn().mockResolvedValue(true), b);
    first.input();
    await vi.advanceTimersByTimeAsync(0);
    expect(second.report).not.toHaveBeenCalled();
    second.input();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(second.report).not.toHaveBeenCalled();
    first.blur();
    await vi.advanceTimersByTimeAsync(1);
    expect(second.report).toHaveBeenCalledTimes(1);
  });
  it('allows only one in-flight request and aborts on account switch', async () => {
    let finish!: (value: boolean) => void;
    const report = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const ctx = setup(report as any);
    ctx.input();
    await vi.advanceTimersByTimeAsync(0);
    const signal = (report.mock.calls[0] as any)[1] as AbortSignal;
    ctx.runtime.setOwner('user-b');
    expect(signal.aborted).toBe(true);
    ctx.input();
    await vi.advanceTimersByTimeAsync(0);
    expect(report).toHaveBeenCalledTimes(1);
    finish(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(report).toHaveBeenCalledTimes(2);
    ctx.runtime.dispose();
    finish(false);
  });
});

describe('restricted cross-tab API fallback', () => {
  it('falls back when Web Locks is denied, but does not repeat a failed started report', async () => {
    const target = surface();
    Object.assign(target.win.navigator, { locks: { request: vi.fn().mockRejectedValue(new Error('denied')) } });
    const ctx = setup(vi.fn().mockResolvedValue(true), target);
    ctx.input();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.report).toHaveBeenCalledTimes(1);
    ctx.runtime.dispose();
    const other = surface();
    Object.assign(other.win.navigator, {
      locks: { request: (_key: string, _opts: unknown, callback: (lock: object) => Promise<void>) => callback({}) },
    });
    const failed = setup(vi.fn().mockRejectedValue(new Error('offline')), other);
    failed.input();
    await vi.advanceTimersByTimeAsync(0);
    expect(failed.report).toHaveBeenCalledTimes(1);
  });
});
