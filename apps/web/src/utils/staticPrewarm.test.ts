import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStaticPrewarmScheduler,
  prewarmNetworkMode,
  isConstrainedPrewarmDevice,
  validatePrewarmManifest,
  type PrewarmManifest,
} from './staticPrewarm';
import {
  activeRequestCount,
  beginRequestActivity,
  endRequestActivity,
  holdForegroundActivity,
  withForegroundActivity,
  holdRequestActivity,
} from '@/http/requestActivity';

const connection = new EventTarget() as EventTarget & { saveData?: boolean; effectiveType?: string; type?: string };
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
  connection.type = undefined;
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
    ready: () => ready,
    fetcher,
  });
});
afterEach(() => {
  scheduler.dispose();
  delete window.LightNoteAndroid;
  delete window.__lightNoteAndroidPrewarmNetwork;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetcher.mockReset();
});
const advance = () => vi.advanceTimersByTimeAsync(9000);

describe('统一静态预热', () => {
  it('首屏完成一秒后才下载清单，然后按优先级串行去重', async () => {
    scheduler.submit({ urls: [second], priority: 4 });
    scheduler.submit({ urls: [asset, second], priority: 0 });
    await vi.advanceTimersByTimeAsync(999);
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
    await vi.advanceTimersByTimeAsync(999);
    expect(fetcher).not.toHaveBeenCalled();
    await advance();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('连续点击、输入、滚动不会取消下载或重置启动窗口', async () => {
    let signal: AbortSignal | undefined;
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith('.json')) return manifestResponse();
      signal = init!.signal!;
      return new Promise((_resolve, reject) =>
        signal!.addEventListener('abort', () => reject(Error('abort')), { once: true }),
      );
    });
    scheduler.submit({ urls: [asset], priority: 1 });
    for (let i = 0; i < 100; i++) {
      for (const type of ['pointerdown', 'keydown', 'scroll']) window.dispatchEvent(new Event(type));
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(signal?.aborted).toBe(false);
    expect(scheduler.snapshot().aborts.foreground).toBe(0);
  });
  it('已排队的调度任务不能跳过后来开始的前台活动', async () => {
    scheduler.submit({ urls: [asset], priority: 1 });
    await vi.advanceTimersByTimeAsync(999);
    const release = holdForegroundActivity();
    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      release();
    }
    await vi.advanceTimersByTimeAsync(1100);
    expect(scheduler.snapshot().completed).toBe(1);
  });
  it('前台立即中止；反复中断只延后当前文件，其他资源继续', async () => {
    let signal: AbortSignal | undefined;
    fetcher.mockImplementation(async (url, init) => {
      if (String(url).endsWith('.json')) return manifestResponse();
      if (url === second) return response(256);
      signal = init!.signal!;
      return new Promise((_resolve, reject) =>
        signal!.addEventListener('abort', () => reject(Error('abort')), { once: true }),
      );
    });
    scheduler.submit({ groups: ['frames'], priority: 1 });
    await vi.advanceTimersByTimeAsync(1100);
    let release = holdForegroundActivity();
    expect(signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    release();
    await vi.advanceTimersByTimeAsync(550);
    expect(signal?.aborted).toBe(false);
    release = holdForegroundActivity();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await vi.advanceTimersByTimeAsync(600);
    expect(fetcher.mock.calls.filter(([url]) => url === asset)).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([url]) => url === second)).toHaveLength(1);
    fetcher.mockImplementation(async () => response(128));
    await vi.advanceTimersByTimeAsync(5000);
    expect(scheduler.snapshot()).toMatchObject({ completed: 2, failed: 0 });
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
  it('移动端控制资源范围；核心资源连续完成，非计费网络确认后自动补齐扩展包', async () => {
    mobile = true;
    window.LightNoteAndroid = { postMessage: vi.fn() };
    scheduler.dispose();
    scheduler = createStaticPrewarmScheduler({ entryUrl: entry, mobile: () => mobile, fetcher, ready: () => ready });
    data.assets[asset] = 3 * 1024 * 1024;
    scheduler.submit({ urls: [asset], priority: 1 });
    scheduler.submit({ urls: [second], priority: 2, optional: true });
    await advance();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/static-prewarm.json', asset]);
    expect(scheduler.snapshot()).toMatchObject({ mode: 'core', deferred: 1, reason: 'core-complete' });
    window.__lightNoteAndroidPrewarmNetwork?.(true);
    await advance();
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/static-prewarm.json', asset, second]);
    expect(scheduler.snapshot().reason).toBe('complete');
    scheduler.dispose();
    delete window.LightNoteAndroid;
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

it('一次空闲连续完成超过 12 MiB 的有限清单，未知桌面网络也不等待额度', async () => {
  connection.effectiveType = undefined;
  const urls = Array.from({ length: 5 }, (_, n) => `/assets/large-${n}.webp`);
  for (const url of urls) data.assets[url] = 3 * 1024 * 1024;
  scheduler.submit({ urls, priority: 5, optional: true });
  await advance();
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/static-prewarm.json', ...urls]);
  expect(scheduler.snapshot()).toMatchObject({ completed: 5, pending: 0, reason: 'complete' });
  expect(scheduler.snapshot().readBytes).toBeGreaterThan(15 * 1024 * 1024);
  await vi.advanceTimersByTimeAsync(120000);
  expect(fetcher).toHaveBeenCalledTimes(6);
});

it('后台轮询不阻塞启动，也不取消正在进行的预热', async () => {
  const release = holdRequestActivity('background');
  scheduler.submit({ urls: [asset], priority: 1 });
  await vi.advanceTimersByTimeAsync(1200);
  expect(scheduler.snapshot().completed).toBe(1);
  release();
});

it('短续页允许当前下载完成，结束100ms后才启动下一项', async () => {
  let finish!: () => void;
  let signal: AbortSignal | undefined;
  fetcher.mockImplementation(async (url, init) => {
    if (String(url).endsWith('.json')) return manifestResponse();
    if (url === second) return response(256);
    signal = init!.signal!;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return response(128);
  });
  scheduler.submit({ groups: ['frames'], priority: 1 });
  await vi.advanceTimersByTimeAsync(1100);
  const release = holdRequestActivity('incremental');
  finish();
  await vi.advanceTimersByTimeAsync(200);
  expect(signal?.aborted).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(2);
  release();
  await vi.advanceTimersByTimeAsync(99);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('重叠续页以最早未结束请求计时，一秒后升级，结束500ms后恢复', async () => {
  let signal: AbortSignal | undefined;
  fetcher.mockImplementation(async (url, init) => {
    if (String(url).endsWith('.json')) return manifestResponse();
    signal = init!.signal!;
    return new Promise((_resolve, reject) =>
      signal!.addEventListener('abort', () => reject(Error('abort')), { once: true }),
    );
  });
  scheduler.submit({ urls: [asset], priority: 1 });
  await vi.advanceTimersByTimeAsync(1100);
  const a = holdRequestActivity('incremental');
  await vi.advanceTimersByTimeAsync(600);
  const b = holdRequestActivity('incremental');
  await vi.advanceTimersByTimeAsync(399);
  expect(signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(signal?.aborted).toBe(true);
  a();
  b();
  fetcher.mockImplementation(async () => response(128));
  await vi.advanceTimersByTimeAsync(499);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  expect(scheduler.snapshot().completed).toBe(1);
});

it('真正的网络失败最多重试两次，其他资源不被坏文件阻塞', async () => {
  fetcher.mockImplementation(async (url) => {
    if (String(url).endsWith('.json')) return manifestResponse();
    if (url === asset) throw Error('network');
    return response(data.assets[String(url)]);
  });
  scheduler.submit({ groups: ['frames'], priority: 1 });
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher.mock.calls.filter(([url]) => url === asset)).toHaveLength(3);
  expect(fetcher.mock.calls.filter(([url]) => url === second)).toHaveLength(1);
  expect(scheduler.snapshot()).toMatchObject({ failed: 1, completed: 1, pending: 0 });
  await vi.advanceTimersByTimeAsync(120000);
  expect(fetcher).toHaveBeenCalledTimes(5);
});

it('切后台中止下载，回前台重新等待空闲后恢复', async () => {
  let signal: AbortSignal | undefined;
  fetcher.mockImplementation(async (url, init) => {
    if (String(url).endsWith('.json')) return manifestResponse();
    signal = init!.signal!;
    return new Promise((_resolve, reject) =>
      signal!.addEventListener('abort', () => reject(Error('abort')), { once: true }),
    );
  });
  scheduler.submit({ urls: [asset], priority: 1 });
  await advance();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(signal?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(120000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockImplementation(async () => response(128));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(499);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await advance();
  expect(scheduler.snapshot().completed).toBe(1);
});

it('网络范围不能把 4g 或 Wi-Fi 名称误当成非计费确认', () => {
  expect(prewarmNetworkMode(true, { effectiveType: '4g' })).toBe('core');
  expect(prewarmNetworkMode(true, { type: 'wifi' })).toBe('core');
  expect(prewarmNetworkMode(false, undefined)).toBe('full');
  expect(prewarmNetworkMode(false, { type: 'cellular' })).toBe('core');
  expect(prewarmNetworkMode(true, {}, true)).toBe('full');
  expect(prewarmNetworkMode(false, {}, false)).toBe('core');
  expect(prewarmNetworkMode(true, { saveData: true }, true)).toBe('paused');
});

it('浏览器始终没有 idle 回调也能推进，但仍保护未就绪首屏', async () => {
  const idle = vi.fn();
  vi.stubGlobal('requestIdleCallback', idle);
  ready = false;
  scheduler.submit({ groups: ['frames'], priority: 1 });
  await advance();
  expect(fetcher).not.toHaveBeenCalled();
  ready = true;
  scheduler.activity();
  await vi.advanceTimersByTimeAsync(1100);
  expect(scheduler.snapshot().completed).toBe(2);
  expect(idle).not.toHaveBeenCalled();
});

it('桌面窗口变窄不降低网络策略，纯触屏设备仍使用保守策略', () => {
  vi.stubGlobal('innerWidth', 924);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(any-pointer: fine)' }));
  expect(isConstrainedPrewarmDevice()).toBe(false);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
  expect(isConstrainedPrewarmDevice()).toBe(true);
});

it('App 切到计费网络时取消扩展下载，恢复非计费网络后继续', async () => {
  mobile = true;
  window.LightNoteAndroid = { postMessage: vi.fn() };
  scheduler.dispose();
  scheduler = createStaticPrewarmScheduler({ entryUrl: entry, mobile: () => mobile, fetcher, ready: () => ready });
  let signal: AbortSignal | undefined;
  fetcher.mockImplementation(async (url, init) => {
    if (String(url).endsWith('.json')) return manifestResponse();
    signal = init!.signal!;
    return new Promise((_resolve, reject) =>
      signal!.addEventListener('abort', () => reject(Error('abort')), { once: true }),
    );
  });
  scheduler.submit({ urls: [asset], priority: 1, optional: true });
  window.__lightNoteAndroidPrewarmNetwork?.(true);
  await advance();
  expect(signal?.aborted).toBe(false);
  window.__lightNoteAndroidPrewarmNetwork?.(false);
  expect(signal?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockImplementation(async () => response(128));
  window.__lightNoteAndroidPrewarmNetwork?.(true);
  await advance();
  expect(scheduler.snapshot()).toMatchObject({ completed: 1, mode: 'full' });
});

it('清单下载多次被主动打断也不会永久禁用预热', async () => {
  fetcher.mockImplementation(
    async (_url, init) =>
      new Promise((_resolve, reject) =>
        init!.signal!.addEventListener('abort', () => reject(Error('abort')), { once: true }),
      ),
  );
  scheduler.submit({ urls: [asset], priority: 1 });
  await advance();
  holdForegroundActivity()();
  await advance();
  holdForegroundActivity()();
  await vi.advanceTimersByTimeAsync(0);
  expect(scheduler.snapshot()).toMatchObject({ disabled: false, aborts: { foreground: 2 } });
  fetcher.mockImplementation(async (url) => (String(url).endsWith('.json') ? manifestResponse() : response(128)));
  await vi.advanceTimersByTimeAsync(60000);
  expect(scheduler.snapshot()).toMatchObject({ disabled: false, completed: 1, reason: 'complete' });
});

it('拒绝响应头后立即取消响应，不能留下未读的大文件占用网络', async () => {
  let signal: AbortSignal | undefined;
  fetcher.mockImplementation(async (url, init) => {
    if (String(url).endsWith('.json')) return manifestResponse();
    signal = init!.signal!;
    return new Response(new ReadableStream(), { headers: { 'Content-Type': 'text/html' } });
  });
  scheduler.submit({ urls: [asset], priority: 1 });
  await advance();
  expect(signal?.aborted).toBe(true);
  expect(scheduler.snapshot()).toMatchObject({ failed: 1, reason: 'complete-with-errors' });
});

it('pagehide cannot restart a canceled download until pageshow', async () => {
  fetcher.mockImplementation(async (url, init) =>
    String(url).endsWith('.json')
      ? manifestResponse()
      : new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(Error('abort')))),
  );
  scheduler.submit({ urls: [asset], priority: 1 });
  await vi.advanceTimersByTimeAsync(1100);
  window.dispatchEvent(new Event('pagehide'));
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(scheduler.snapshot().aborts.restricted).toBe(1);
  fetcher.mockImplementation(async () => response(128));
  window.dispatchEvent(new Event('pageshow'));
  await vi.advanceTimersByTimeAsync(499);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(51);
  expect(scheduler.snapshot().completed).toBe(1);
});
it('Web Locks contention retries after 500ms without holding a lock while foreground runs', async () => {
  let free = false;
  const request = vi.fn(async (_name, _options, callback) => callback(free ? {} : null));
  Object.assign(navigator, { locks: { request } });
  scheduler.submit({ urls: [asset], priority: 1 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(request).toHaveBeenCalledTimes(1);
  expect(fetcher).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(499);
  expect(request).toHaveBeenCalledTimes(1);
  const release = holdForegroundActivity();
  free = true;
  await vi.advanceTimersByTimeAsync(1500);
  expect(request).toHaveBeenCalledTimes(1);
  release();
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetcher).toHaveBeenCalled();
  expect(request).toHaveBeenCalledWith('lightnote:static-prewarm', { ifAvailable: true }, expect.any(Function));
});
it('denied Web Locks safely fall back to one transfer at a time', async () => {
  const request = vi.fn().mockRejectedValue(new Error('denied'));
  Object.assign(navigator, { locks: { request } });
  scheduler.submit({ groups: ['frames'], priority: 1 });
  await advance();
  expect(request).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(scheduler.snapshot().completed).toBe(2);
});

it('background completions neither postpone launch nor cancel another in-flight file', async () => {
  scheduler.dispose();
  let notify!: PerformanceObserverCallback;
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      constructor(callback: PerformanceObserverCallback) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  scheduler = createStaticPrewarmScheduler({ entryUrl: entry, mobile: () => false, ready: () => true, fetcher });
  let signal: AbortSignal | undefined;
  fetcher.mockImplementation(async (url, init) => {
    if (String(url).endsWith('.json')) return manifestResponse();
    signal = init!.signal!;
    return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(Error('abort'))));
  });
  scheduler.submit({ groups: ['frames'], priority: 1 });
  const emit = (name: string, decodedBodySize: number) =>
    notify(
      { getEntries: () => [{ name, decodedBodySize }] } as PerformanceObserverEntryList,
      {} as PerformanceObserver,
      {},
    );
  for (let i = 0; i < 110; i++) {
    emit('/api/background', 32);
    await vi.advanceTimersByTimeAsync(10);
  }
  expect(fetcher).toHaveBeenCalledTimes(2);
  emit(second, 256);
  expect(signal?.aborted).toBe(false);
  expect(scheduler.snapshot().completed).toBe(1);
  emit(asset, 64);
  expect(scheduler.snapshot().completed).toBe(1);
});

it('resize preserves a matching scene and cancels only an obsolete size', async () => {
  vi.stubGlobal('innerWidth', 800);
  vi.stubGlobal('devicePixelRatio', 1);
  data.manorScene = [
    { url: asset, width: 1000 },
    { url: second, width: 2000 },
  ];
  data.groups['manor.critical'] = [second];
  let signal: AbortSignal | undefined;
  fetcher.mockImplementation(async (url, init) => {
    if (String(url).endsWith('.json')) return manifestResponse();
    signal = init!.signal!;
    return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(Error('abort'))));
  });
  scheduler.submit({ groups: ['manor.critical'], priority: 1 });
  await vi.advanceTimersByTimeAsync(1100);
  vi.stubGlobal('innerWidth', 900);
  window.dispatchEvent(new Event('resize'));
  expect(signal?.aborted).toBe(false);
  vi.stubGlobal('innerWidth', 1600);
  window.dispatchEvent(new Event('resize'));
  expect(signal?.aborted).toBe(true);
  fetcher.mockImplementation(async () => response(256));
  await vi.advanceTimersByTimeAsync(100);
  expect(fetcher.mock.calls.at(-1)?.[0]).toBe(second);
  expect(scheduler.snapshot()).toMatchObject({ completed: 1, aborts: { selection: 1, foreground: 0 } });
});
it('revoking an account scope aborts its resource; a new scope can proceed without the old queue', async () => {
  let signal: AbortSignal | undefined;
  fetcher.mockImplementation(async (url, init) => {
    if (String(url).endsWith('.json')) return manifestResponse();
    signal = init!.signal!;
    return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(Error('abort'))));
  });
  const logout = scheduler.submit({ urls: [asset], priority: 1 });
  await vi.advanceTimersByTimeAsync(1100);
  logout();
  expect(signal?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  fetcher.mockImplementation(async () => response(256));
  scheduler.submit({ urls: [second], priority: 1 });
  await vi.advanceTimersByTimeAsync(600);
  expect(scheduler.snapshot()).toMatchObject({ selected: 1, completed: 1 });
});

function mockOriginLock() {
  let held = false;
  const request = vi.fn(async (_name, _options, callback) => {
    if (held) return callback(null);
    held = true;
    try {
      return await callback({});
    } finally {
      held = false;
    }
  });
  Object.assign(navigator, { locks: { request } });
  return { request, held: () => held };
}
function pendingPool(count = 8) {
  const jobs = new Map<string, { signal: AbortSignal; finish: () => void }>();
  const urls = Array.from({ length: count }, (_, index) => `/assets/pool-${index}.js`);
  for (const url of urls) data.assets[url] = 128;
  fetcher.mockImplementation(async (url, init) => {
    if (String(url).endsWith('.json')) return manifestResponse();
    return new Promise<Response>((resolve, reject) => {
      const signal = init!.signal!;
      jobs.set(String(url), { signal, finish: () => resolve(response(128)) });
      signal.addEventListener('abort', () => reject(Error('abort')), { once: true });
    });
  });
  scheduler.submit({ urls, priority: 3 });
  return { jobs, urls };
}
it('四并发共享一把锁，完成任一文件立即补位，插队和重复提交不会重复下载', async () => {
  const lock = mockOriginLock();
  const { jobs, urls } = pendingPool();
  await vi.advanceTimersByTimeAsync(1100);
  expect(scheduler.snapshot()).toMatchObject({ inFlight: 4, concurrency: 4, peakConcurrency: 4 });
  expect(lock.held()).toBe(true);
  scheduler.submit({ urls: [urls[6], urls[0]], priority: -1 });
  jobs.get(urls[2])!.finish();
  await vi.advanceTimersByTimeAsync(10);
  expect([...jobs.keys()]).toEqual([...urls.slice(0, 4), urls[6]]);
  expect(jobs.get(urls[0])!.signal.aborted).toBe(false);
  expect(fetcher.mock.calls.filter(([url]) => url === urls[0])).toHaveLength(1);
  expect(lock.request).toHaveBeenCalledTimes(1);
  const release = holdForegroundActivity();
  try {
    expect([...jobs.values()].filter((job) => job.signal.aborted)).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(lock.held()).toBe(false);
    expect(scheduler.snapshot()).toMatchObject({ inFlight: 0, aborts: { foreground: 4 } });
  } finally {
    release();
  }
});
it('续页只保留一个在途下载且停止补位，慢续页统一中断，结束后恢复', async () => {
  mockOriginLock();
  const { jobs, urls } = pendingPool();
  await vi.advanceTimersByTimeAsync(1100);
  let release = holdRequestActivity('incremental');
  try {
    jobs.get(urls[0])!.finish();
    await vi.advanceTimersByTimeAsync(200);
    expect(jobs.size).toBe(4);
    expect(scheduler.snapshot()).toMatchObject({ inFlight: 0, aborts: { 'incremental-capacity': 3 } });
  } finally {
    release();
  }
  await vi.advanceTimersByTimeAsync(99);
  expect(jobs.size).toBe(4);
  await vi.advanceTimersByTimeAsync(1);
  expect(jobs.size).toBe(5);
  release = holdRequestActivity('incremental');
  try {
    await vi.advanceTimersByTimeAsync(999);
    expect(scheduler.snapshot().aborts.incremental).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(scheduler.snapshot().aborts.incremental).toBe(1);
  } finally {
    release();
  }
  await vi.advanceTimersByTimeAsync(499);
  expect(scheduler.snapshot().inFlight).toBe(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(scheduler.snapshot().inFlight).toBe(4);
});
it('核心模式及锁不可用均保持单并发；已缓存的队列没有逐文件50ms延迟', async () => {
  mockOriginLock();
  mobile = true;
  const { jobs, urls } = pendingPool();
  await vi.advanceTimersByTimeAsync(1100);
  expect(scheduler.snapshot()).toMatchObject({ concurrency: 1, inFlight: 1 });
  jobs.get(urls[0])!.finish();
  await vi.advanceTimersByTimeAsync(10);
  expect(jobs.size).toBe(2);
});
it('已完成状态优先于隐藏，诊断区分下载和暂停且不持续累计完成后的时间', async () => {
  mockOriginLock();
  const { jobs } = pendingPool(1);
  await vi.advanceTimersByTimeAsync(1100);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(2000);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(600);
  [...jobs.values()][0].finish();
  await vi.advanceTimersByTimeAsync(10);
  const before = scheduler.snapshot();
  expect(before.reason).toBe('complete');
  expect(before.timings.durationMs.hidden).toBeGreaterThanOrEqual(2000);
  expect(before.timings.durationMs.fetching).toBeGreaterThan(0);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  await vi.advanceTimersByTimeAsync(5000);
  expect(scheduler.snapshot().reason).toBe('complete');
  expect(scheduler.snapshot().timings.elapsedMs).toBe(before.timings.elapsedMs);
});
it('同源两个调度器合计只有一个下载池，完成和取消都会释放锁', async () => {
  const lock = mockOriginLock();
  const { urls } = pendingPool();
  const otherFetch = vi.fn(async (url) => (String(url).endsWith('.json') ? manifestResponse() : response(128)));
  const other = createStaticPrewarmScheduler({ entryUrl: entry, mobile: () => false, fetcher: otherFetch });
  try {
    other.submit({ urls, priority: 1 });
    await vi.advanceTimersByTimeAsync(1100);
    expect(scheduler.snapshot().inFlight).toBe(4);
    expect(otherFetch).not.toHaveBeenCalled();
    scheduler.dispose();
    await vi.advanceTimersByTimeAsync(600);
    expect(other.snapshot().completed).toBe(8);
    expect(lock.held()).toBe(false);
  } finally {
    other.dispose();
  }
});
