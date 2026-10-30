import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const source = readFileSync(resolve(process.cwd(), 'public/light-note-sw.js'), 'utf8');
const ORIGIN = 'https://light.test';

function okResponse(body: string, status = 200, type: ResponseType = 'basic') {
  const response = new Response(body, { status });
  Object.defineProperty(response, 'type', { value: type });
  return response;
}

function harness({ search = '?v=3', script = source } = {}) {
  const listeners: Record<string, Function> = {};
  const stores = new Map<string, Map<string, Response>>();
  const open = vi.fn(async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    const key = (request: Request | string) => (typeof request === 'string' ? new URL(request, ORIGIN).href : request.url);
    return {
      match: async (request: Request | string) => store.get(key(request))?.clone(),
      put: async (request: Request | string, response: Response) => void store.set(key(request), response),
      delete: async (request: Request | string) => store.delete(key(request)),
      keys: async () => [...store.keys()].map((url) => new Request(url)),
    };
  });
  const fetch = vi.fn(async (input: Request | string) => okResponse(`network:${typeof input === 'string' ? input : input.url}`));
  const caches = {
    open,
    match: vi.fn(async () => undefined),
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name: string) => stores.delete(name)),
  };
  const navigationPreload = { enable: vi.fn(), disable: vi.fn() };
  runInNewContext(script, {
    self: {
      location: { origin: ORIGIN, search },
      addEventListener: (name: string, fn: Function) => {
        listeners[name] = listeners[name] ? ((prev) => (event: unknown) => (prev(event), fn(event)))(listeners[name]) : fn;
      },
      clients: { claim: vi.fn() },
      registration: { navigationPreload },
      skipWaiting: vi.fn(),
    },
    URL, URLSearchParams, Request, Response, fetch, caches, indexedDB: undefined,
  });
  const dispatch = (request: Request) => {
    const respondWith = vi.fn();
    listeners.fetch({ request, respondWith, preloadResponse: Promise.resolve(undefined) });
    return respondWith;
  };
  const sync = async (manifest: string[], sourceUrl = `${ORIGIN}/workbenches`) => {
    fetch.mockImplementationOnce(async () => okResponse(manifest.map((path) => path.slice(1)).join('\n') + '\n'));
    const postMessage = vi.fn();
    let work: Promise<unknown> = Promise.resolve();
    listeners.message({ source: { url: sourceUrl }, data: { type: 'assets.sync' }, ports: [{ postMessage }], waitUntil: (p: Promise<unknown>) => (work = p) });
    await work;
    return postMessage.mock.calls[0]?.[0];
  };
  const cached = () => [...(stores.get('light-note-assets-v1')?.keys() || [])].map((url) => new URL(url).pathname).filter((path) => path.startsWith('/assets/')).sort();
  const activate = async () => {
    let activation: Promise<unknown> = Promise.resolve();
    listeners.activate({ waitUntil: (p: Promise<unknown>) => (activation = p) });
    await activation;
  };
  return { listeners, fetch, caches, stores, navigationPreload, dispatch, sync, cached, activate };
}

describe('构建资源的 Service Worker 缓存', () => {
  it('哈希资源缓存优先：首次走网络并保存，之后直接命中缓存', async () => {
    const h = harness();
    const request = new Request(`${ORIGIN}/assets/Inbox-abc123.js`);
    const first = await h.dispatch(request).mock.calls[0][0];
    expect(await first.text()).toContain('network:');
    await Promise.resolve();
    const again = await h.dispatch(new Request(`${ORIGIN}/assets/Inbox-abc123.js`)).mock.calls[0][0];
    expect(await again.text()).toContain('network:');
    expect(h.fetch).toHaveBeenCalledTimes(1);
  });

  it('只保存完整的同源成功响应，失败、分段或不透明响应照常返回但不入缓存', async () => {
    const h = harness();
    for (const response of [okResponse('missing', 404), okResponse('', 200, 'opaque'), okResponse('partial', 206)]) {
      h.fetch.mockResolvedValueOnce(response);
      expect(await h.dispatch(new Request(`${ORIGIN}/assets/a-${response.status}-${response.type}.js`)).mock.calls[0][0]).toBe(response);
    }
    await Promise.resolve();
    expect(h.cached()).toEqual([]);
    const ranged = new Request(`${ORIGIN}/assets/video.mp4`, { headers: { range: 'bytes=0-10' } });
    expect(h.dispatch(ranged)).not.toHaveBeenCalled();
  });

  it('接口、原生分享路径、跨域同名路径不经过资源缓存', () => {
    const h = harness();
    for (const url of [`${ORIGIN}/api/user/me`, `${ORIGIN}/__native-share/abc/file.png`, 'https://cdn.test/assets/a.js']) {
      expect(h.dispatch(new Request(url))).not.toHaveBeenCalled();
    }
  });

  it('App 模式不接管页面导航也不开导航预加载，浏览器仍保留离线页兜底', async () => {
    const navigate = { url: `${ORIGIN}/workbenches`, method: 'GET', mode: 'navigate', headers: new Headers() } as unknown as Request;
    const app = harness({ search: '?v=3&app=1' });
    expect(app.dispatch(navigate)).not.toHaveBeenCalled();
    await app.activate();
    expect(app.navigationPreload.disable).toHaveBeenCalledOnce();
    expect(app.navigationPreload.enable).not.toHaveBeenCalled();
    const browser = harness();
    expect(browser.dispatch(navigate)).toHaveBeenCalledOnce();
    await browser.activate();
    expect(browser.navigationPreload.enable).toHaveBeenCalledOnce();
  });

  it('按发布清单只保留当前与上一版本的资源', async () => {
    const h = harness();
    const warm = async (paths: string[]) => {
      for (const path of paths) await h.dispatch(new Request(`${ORIGIN}${path}`)).mock.calls[0][0];
      await Promise.resolve();
    };
    await warm(['/assets/v1-a.js', '/assets/v1-b.css', '/assets/stale.js']);
    expect(await h.sync(['/assets/v1-a.js', '/assets/v1-b.css'])).toMatchObject({ enabled: true, synced: true, pruned: 1 });
    expect(h.cached()).toEqual(['/assets/v1-a.js', '/assets/v1-b.css']);
    await warm(['/assets/v2-a.js']);
    await h.sync(['/assets/v2-a.js', '/assets/v1-b.css']);
    expect(h.cached()).toEqual(['/assets/v1-a.js', '/assets/v1-b.css', '/assets/v2-a.js']);
    await warm(['/assets/v3-a.js']);
    await h.sync(['/assets/v3-a.js']);
    // 第三个版本发布后，只属于第一个版本的文件被清理。
    expect(h.cached()).toEqual(['/assets/v1-b.css', '/assets/v2-a.js', '/assets/v3-a.js']);
  });

  it('只响应同源页面的同步请求', async () => {
    const h = harness();
    expect(await h.sync(['/assets/a.js'], 'https://evil.test/')).toBeUndefined();
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('关闭总开关后不再缓存，激活时清空旧资源缓存', async () => {
    const h = harness({ script: source.replace('const ASSET_CACHE_ENABLED = true;', 'const ASSET_CACHE_ENABLED = false;') });
    h.stores.set('light-note-assets-v1', new Map());
    expect(h.dispatch(new Request(`${ORIGIN}/assets/a.js`))).not.toHaveBeenCalled();
    await h.activate();
    expect(h.caches.delete).toHaveBeenCalledWith('light-note-assets-v1');
    expect(await h.sync(['/assets/a.js'])).toEqual({ enabled: false });
  });
});
