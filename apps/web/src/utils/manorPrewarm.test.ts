import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let stop: (() => void) | undefined;
const connection = new EventTarget() as EventTarget & { saveData?: boolean; effectiveType?: string };
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  connection.saveData = false;
  connection.effectiveType = '4g';
  vi.stubGlobal('navigator', { onLine: true, connection });
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('PerformanceObserver', undefined);
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('complete');
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  fetcher.mockImplementation(
    async (input) =>
      new Response(
        String(input).endsWith('preload.json')
          ? JSON.stringify({ desktop: ['/manor/pc.webp'], mobile: ['/manor/mobile.webp'] })
          : new Uint8Array(128),
      ),
  );
});
afterEach(async () => {
  stop?.();
  stop = undefined;
  await Promise.resolve();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetcher.mockReset();
  document.body.innerHTML = '';
});

describe('庄园空闲素材预取', () => {
  it('可见懒加载图片尚未完成时继续让出网络', async () => {
    const image = document.createElement('img');
    image.loading = 'lazy';
    Object.defineProperty(image, 'complete', { value: false, configurable: true });
    vi.spyOn(image, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
    } as DOMRect);
    document.body.append(image);
    stop = (await import('./manorPrewarm')).scheduleManorPrewarm(false);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(fetcher).not.toHaveBeenCalled();
    Object.defineProperty(image, 'complete', { value: true, configurable: true });
    window.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(9_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('首屏稳定后串行预取当前端素材，以低优先级填充 HTTP 缓存', async () => {
    stop = (await import('./manorPrewarm')).scheduleManorPrewarm(true);
    await vi.advanceTimersByTimeAsync(7_999);
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/manor/preload.json', '/manor/mobile.webp']);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ priority: 'low', cache: 'force-cache' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('前台 API 未完成时不预取，结束后重新等待空闲', async () => {
    const activity = await import('@/http/requestActivity'),
      request = {};
    activity.beginRequestActivity(request);
    stop = (await import('./manorPrewarm')).scheduleManorPrewarm(false);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(fetcher).not.toHaveBeenCalled();
    activity.endRequestActivity(request);
    await vi.advanceTimersByTimeAsync(7_999);
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe('/manor/pc.webp');
  });
  it('输入或新 API 请求立即取消在途预取，导航销毁后不再重试', async () => {
    let signal: AbortSignal | undefined;
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith('preload.json'))
        return new Response(JSON.stringify({ desktop: ['/manor/pc.webp'], mobile: [] }));
      signal = init!.signal!;
      return new Promise((_resolve, reject) =>
        signal!.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true }),
      );
    });
    stop = (await import('./manorPrewarm')).scheduleManorPrewarm(false);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(signal?.aborted).toBe(false);
    window.dispatchEvent(new Event('pointerdown'));
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const activity = await import('@/http/requestActivity'),
      request = {};
    activity.beginRequestActivity(request);
    expect(signal?.aborted).toBe(true);
    stop();
    stop = undefined;
    activity.endRequestActivity(request);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each(['saveData', 'hidden', 'offline', '3g'])('%s 时不争抢资源', async (mode) => {
    if (mode === 'saveData') connection.saveData = true;
    if (mode === '3g') connection.effectiveType = '3g';
    if (mode === 'hidden') vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    if (mode === 'offline') vi.stubGlobal('navigator', { onLine: false, connection });
    stop = (await import('./manorPrewarm')).scheduleManorPrewarm(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('拒绝清单里的 API 与跨域地址，不发账号读取或场景命令', async () => {
    fetcher.mockResolvedValue(
      new Response(JSON.stringify({ desktop: ['/api/growth/manor'], mobile: ['https://other.invalid/picture'] })),
    );
    stop = (await import('./manorPrewarm')).scheduleManorPrewarm(false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/manor/preload.json']);
  });
  it('请求计数在重复结束和未知请求下不变成负数', async () => {
    const activity = await import('@/http/requestActivity'),
      a = {},
      b = {};
    activity.beginRequestActivity(a);
    activity.beginRequestActivity(a);
    activity.beginRequestActivity(b);
    expect(activity.activeRequestCount()).toBe(2);
    activity.endRequestActivity(a);
    activity.endRequestActivity(a);
    activity.endRequestActivity({});
    expect(activity.activeRequestCount()).toBe(1);
    activity.endRequestActivity(b);
    expect(activity.activeRequestCount()).toBe(0);
  });
});
