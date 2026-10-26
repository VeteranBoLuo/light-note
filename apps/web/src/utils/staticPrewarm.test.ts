import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStaticPrewarmScheduler,
  prewarmBudget,
  validatePrewarmManifest,
  type PrewarmManifest,
} from './staticPrewarm';
import { activeRequestCount, holdForegroundActivity, withForegroundActivity } from '@/http/requestActivity';

const connection = new EventTarget() as EventTarget & { saveData?: boolean; effectiveType?: string };
const entry = '/assets/app-123.js';
const asset = '/assets/frame-123.webp';
const second = '/assets/frame-456.webp';
const fetcher = vi.fn<typeof fetch>();
let scheduler: ReturnType<typeof createStaticPrewarmScheduler>;
let data: PrewarmManifest;
let mobile = false;
let ready = true;
const response = (bytes: number) => new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/webp' } });
const manifestResponse = () => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  vi.useFakeTimers();
  connection.saveData = false;
  connection.effectiveType = '4g';
  mobile = false;
  ready = true;
  vi.stubGlobal('navigator', { onLine: true, connection });
  vi.stubGlobal('PerformanceObserver', undefined);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  data = { version: 1, entries: [entry], assets: { [asset]: 128, [second]: 256 }, groups: { frames: [asset, second] } };
  fetcher.mockImplementation(async (url) =>
    String(url).endsWith('.json') ? manifestResponse() : response(data.assets[String(url)]),
  );
  scheduler = createStaticPrewarmScheduler({
    entryUrl: entry,
    mobile: () => mobile,
    ready: () => ready && activeRequestCount() === 0,
    fetcher,
  });
});
afterEach(() => {
  scheduler.dispose();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetcher.mockReset();
});
const advance = () => vi.advanceTimersByTimeAsync(9000);

describe('统一静态预热', () => {
  it('首屏完成且空闲八秒才下载清单，然后按优先级串行去重', async () => {
    scheduler.submit({ urls: [second], priority: 4 });
    scheduler.submit({ urls: [asset, second], priority: 0 });
    await vi.advanceTimersByTimeAsync(7999);
    expect(fetcher).not.toHaveBeenCalled();
    await advance();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/static-prewarm.json', asset, second]);
    expect(fetcher.mock.calls[1][1]).toMatchObject({ priority: 'low', cache: 'force-cache', redirect: 'error' });
    scheduler.submit({ groups: ['frames'], priority: 0 });
    await advance();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('前台请求与未就绪图片让后台继续等待', async () => {
    ready = false;
    scheduler.submit({ groups: ['frames'], priority: 1 });
    await advance();
    expect(fetcher).not.toHaveBeenCalled();
    ready = true;
    const release = holdForegroundActivity();
    await advance();
    expect(fetcher).not.toHaveBeenCalled();
    release();
    await vi.advanceTimersByTimeAsync(7999);
    expect(fetcher).not.toHaveBeenCalled();
    await advance();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('已排队的 idle 回调在用户操作后不能跳过新的静默窗口', async () => {
    const callbacks: IdleRequestCallback[] = [];
    vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const cancel = vi.fn();
    vi.stubGlobal('cancelIdleCallback', cancel);
    scheduler.submit({ urls: [asset], priority: 1 });
    await vi.advanceTimersByTimeAsync(8000);
    const stale = callbacks[0];
    window.dispatchEvent(new Event('pointerdown'));
    expect(cancel).toHaveBeenCalledWith(1);
    stale({ didTimeout: false, timeRemaining: () => 30 });
    await vi.advanceTimersByTimeAsync(7999);
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    callbacks.at(-1)!({ didTimeout: false, timeRemaining: () => 30 });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('点击立即中止在途下载，只重试一次，已完成文件不重下', async () => {
    let signal: AbortSignal | undefined;
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith('.json')) return manifestResponse();
      if (url === asset) return response(128);
      signal = init!.signal!;
      return new Promise((_resolve, reject) =>
        signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }),
      );
    });
    scheduler.submit({ groups: ['frames'], priority: 1 });
    await advance();
    expect(signal?.aborted).toBe(false);
    window.dispatchEvent(new Event('pointerdown'));
    expect(signal?.aborted).toBe(true);
    await advance();
    window.dispatchEvent(new Event('keydown'));
    await advance();
    expect(fetcher.mock.calls.filter(([url]) => url === asset)).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => url === second)).toHaveLength(2);
    expect(scheduler.snapshot().usedBytes).toBeGreaterThan(128 + 256 * 2);
  });
  it('作用域取消不取消其他调用方还需要的同一资源', async () => {
    let signal: AbortSignal | undefined;
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith('.json')) return manifestResponse();
      signal = init!.signal!;
      return new Promise((_resolve, reject) =>
        signal!.addEventListener('abort', () => reject(Error('abort')), { once: true }),
      );
    });
    const a = scheduler.submit({ urls: [asset], priority: 0 });
    const b = scheduler.submit({ urls: [asset], priority: 1 });
    await advance();
    a();
    expect(signal?.aborted).toBe(false);
    b();
    expect(signal?.aborted).toBe(true);
    await advance();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('手机与未知网络预算较小，导航或取消任务不退还预算', async () => {
    mobile = true;
    connection.effectiveType = undefined;
    data.assets[asset] = 400 * 1024;
    data.assets[second] = 400 * 1024;
    const stop = scheduler.submit({ groups: ['frames'], priority: 1 });
    await advance();
    stop();
    scheduler.submit({ urls: [second], priority: 0 });
    await advance();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/static-prewarm.json', asset]);
    expect(scheduler.snapshot().usedBytes).toBeLessThanOrEqual(512 * 1024);
    expect(prewarmBudget(false, '4g')).toBe(12 * 1024 * 1024);
    expect(prewarmBudget(true, '4g')).toBe(2 * 1024 * 1024);
  });
  it.each(['saveData', '3g', 'offline', 'hidden'])('%s 不启动预热', async (mode) => {
    if (mode === 'saveData') connection.saveData = true;
    if (mode === '3g') connection.effectiveType = '3g';
    if (mode === 'offline') vi.stubGlobal('navigator', { onLine: false, connection });
    if (mode === 'hidden') vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    scheduler.submit({ groups: ['frames'], priority: 1 });
    await advance();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('前台恢复后重等空闲，真实下载错误静默跳过', async () => {
    connection.saveData = true;
    scheduler.submit({ groups: ['frames'], priority: 1 });
    await advance();
    connection.saveData = false;
    connection.dispatchEvent(new Event('change'));
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith('.json')
        ? manifestResponse()
        : url === asset
          ? new Response('', { status: 404 })
          : response(256),
    );
    await advance();
    await advance();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/static-prewarm.json', asset, second]);
  });
  it('发布版本不匹配时停止预热，不能进入刷新或自动导入链路', async () => {
    data.entries = ['/assets/new-version.js'];
    scheduler.submit({ groups: ['frames'], priority: 1 });
    await advance();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(scheduler.snapshot().disabled).toBe(true);
  });
  it('拒绝清单中的业务接口、外站、WASM 和路径穿越', () => {
    for (const url of ['/api/user', 'https://other.test/assets/a.js', '/assets/db.wasm', '/assets/../api/a.js']) {
      expect(() => validatePrewarmManifest({ ...data, assets: { [url]: 128 } }, entry)).toThrow();
    }
  });
  it('拒绝 HTML 回退和截断资源，不记为已完成', async () => {
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith('.json')
        ? manifestResponse()
        : new Response('<html>', { headers: { 'Content-Type': 'text/html' } }),
    );
    scheduler.submit({ urls: [asset], priority: 0 });
    await advance();
    expect(scheduler.snapshot().completed).toBe(0);
  });
  it('庄园只选择符合像素密度的一份图，不下载所有分辨率', async () => {
    vi.stubGlobal('innerWidth', 1000);
    vi.stubGlobal('devicePixelRatio', 2);
    data.manorScene = [
      { url: asset, width: 2048 },
      { url: second, width: 3630 },
    ];
    data.groups['manor.desktop'] = [second];
    scheduler.submit({ groups: ['manor.desktop'], priority: 4 });
    await advance();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/static-prewarm.json', asset]);
  });
  it('前台长任务直到完整结束才释放计数，异常也能释放', async () => {
    let resolve!: () => void;
    const work = withForegroundActivity(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    scheduler.submit({ urls: [asset], priority: 0 });
    await advance();
    expect(fetcher).not.toHaveBeenCalled();
    resolve();
    await work;
    await advance();
    expect(fetcher).toHaveBeenCalledTimes(2);
    await expect(
      withForegroundActivity(async () => {
        throw Error('failed');
      }),
    ).rejects.toThrow('failed');
    expect(activeRequestCount()).toBe(0);
  });
});
