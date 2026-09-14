import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceReuseRuntime } from './resourceReuseRuntime';

const runtimes: ReturnType<typeof createResourceReuseRuntime>[] = [];
function setup(report = vi.fn().mockResolvedValue(true)) {
  const handlers = new Map<string, EventListener>();
  const doc = {
    visibilityState: 'visible',
    hasFocus: () => true,
    addEventListener: (key: string, fn: EventListener) => handlers.set(key, fn),
    removeEventListener: (key: string) => handlers.delete(key),
  };
  const win = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  const runtime = createResourceReuseRuntime({
    report,
    doc: doc as unknown as Document,
    win: win as unknown as Window,
  });
  runtime.setOwner('a');
  runtimes.push(runtime);
  return {
    runtime,
    report,
    doc,
    visibility: () => handlers.get('visibilitychange')?.({} as Event),
    input: (type = 'click', target: Element | null = null, trusted = true) =>
      handlers.get(type)?.({ type, target, isTrusted: trusted } as unknown as Event),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-14T12:00:00+08:00'));
});
afterEach(() => {
  runtimes.splice(0).forEach((r) => r.dispose());
  vi.useRealTimers();
});
const flush = () => vi.advanceTimersByTimeAsync(0);
describe('跨日资料打开采集', () => {
  it('自动加载、模拟点击、隐藏页面都不产生请求', async () => {
    const c = setup();
    c.runtime.captureOpen()('note', 'n');
    c.input('click', null, false);
    c.runtime.captureOpen()('note', 'n');
    c.doc.visibilityState = 'hidden';
    c.input();
    c.runtime.captureOpen()('note', 'n');
    await flush();
    expect(c.report).not.toHaveBeenCalled();
  });
  it('可信打开可跨异步加载，每类首次成功后停止重复上报', async () => {
    const c = setup();
    c.input();
    const opened = c.runtime.captureOpen();
    await vi.advanceTimersByTimeAsync(3000);
    opened('note', 'n');
    await flush();
    expect(c.report).toHaveBeenCalledWith({ resourceType: 'note', resourceId: 'n' }, expect.any(AbortSignal));
    await vi.advanceTimersByTimeAsync(86400000);
    c.input();
    c.runtime.captureOpen()('note', 'other');
    await flush();
    expect(c.report).toHaveBeenCalledTimes(1);
  });
  it('刷新后的已加载资料需真实点击或滚动，未标记的内容不统计', async () => {
    const c = setup();
    const target = document.createElement('div');
    c.input('wheel', target);
    await flush();
    expect(c.report).not.toHaveBeenCalled();
    target.dataset.reuseResourceId = 'n';
    target.dataset.reuseResourceType = 'note';
    c.input('wheel', target);
    await flush();
    expect(c.report).toHaveBeenCalledTimes(1);
  });
  it('切号取消在途请求，丢弃旧打开意图，不把旧成功结果带给新账号', async () => {
    let finish!: (value: boolean) => void;
    const c = setup(
      vi.fn().mockImplementation(
        () =>
          new Promise<boolean>((r) => {
            finish = r;
          }),
      ),
    );
    c.input();
    const opened = c.runtime.captureOpen();
    opened('note', 'n');
    await flush();
    const signal = c.report.mock.calls[0][1];
    c.runtime.setOwner('b');
    expect(signal.aborted).toBe(true);
    finish(true);
    await flush();
    opened('file', '12');
    await flush();
    expect(c.report).toHaveBeenCalledTimes(1);
    c.input();
    c.runtime.captureOpen()('note', 'n');
    await flush();
    expect(c.report).toHaveBeenCalledTimes(2);
  });
  it('失败不自动重试、连点限频，跨日可再次核验当天新建资料', async () => {
    const c = setup(vi.fn().mockResolvedValue(false));
    c.input();
    c.runtime.captureOpen()('note', 'n');
    await flush();
    for (let i = 0; i < 100; i++) {
      c.input();
      c.runtime.captureOpen()('note', 'n');
    }
    await vi.advanceTimersByTimeAsync(86400000);
    expect(c.report).toHaveBeenCalledTimes(1);
    c.input();
    c.runtime.captureOpen()('note', 'n');
    await flush();
    expect(c.report).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('加载中切后台后旧意图失效，回来需新的主动操作', async () => {
    const c = setup();
    c.input();
    const opened = c.runtime.captureOpen();
    c.doc.visibilityState = 'hidden';
    c.visibility();
    c.doc.visibilityState = 'visible';
    c.visibility();
    opened('note', 'n');
    await flush();
    expect(c.report).not.toHaveBeenCalled();
    c.input();
    c.runtime.captureOpen()('note', 'n');
    await flush();
    expect(c.report).toHaveBeenCalledTimes(1);
  });
});
