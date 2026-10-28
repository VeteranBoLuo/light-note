import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

const source = readFileSync(resolve(process.cwd(), 'public/light-note-sw.js'), 'utf8');
function harness() {
  const listeners: Record<string, Function> = {};
  const fetch = vi.fn().mockResolvedValue(new Response('public asset'));
  const match = vi.fn().mockResolvedValue(new Response('offline asset'));
  runInNewContext(source, {
    self: { location: { origin: 'https://light.test' }, addEventListener: (name, fn) => { listeners[name] = fn; } },
    URL, Response, fetch, caches: { match },
  });
  const dispatch = (request: Pick<Request, 'url' | 'method' | 'mode'>, preloadResponse?: Promise<Response>) => {
    const respondWith = vi.fn();
    listeners.fetch({ request, preloadResponse, respondWith });
    return respondWith;
  };
  return { fetch, match, dispatch };
}

describe('庄园公开素材的 Service Worker 网络转发', () => {
  it('保留原 Request 的缓存与凭据模式，直接返回网络层的图片响应', async () => {
    const h = harness(), response = new Response('image bytes', { headers: { 'Content-Type': 'image/webp' } });
    h.fetch.mockResolvedValueOnce(response);
    const request = new Request('https://light.test/manor/knowledge-garden-v19/courtyard/pc-scene-r58.webp', {
      cache: 'force-cache', credentials: 'omit',
    });
    const respond = h.dispatch(request);
    expect(respond).toHaveBeenCalledOnce();
    expect(await respond.mock.calls[0][0]).toBe(response);
    expect(h.fetch).toHaveBeenCalledExactlyOnceWith(request);
    expect(request.cache).toBe('force-cache');
    expect(request.credentials).toBe('omit');
    expect(h.match).not.toHaveBeenCalled();
  });

  it('账号 API、跨域同名路径和非 GET 请求保持原处理边界', () => {
    const h = harness();
    for (const request of [
      new Request('https://light.test/api/growth/manor'),
      new Request('https://external.test/manor/picture-r1.webp'),
      new Request('https://light.test/manor/picture-r1.webp', { method: 'POST' }),
    ]) expect(h.dispatch(request)).not.toHaveBeenCalled();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.match).not.toHaveBeenCalled();
  });

  it('场景文档导航继续复用导航预加载响应', async () => {
    const h = harness(), response = new Response('<html>scene</html>');
    const respond = h.dispatch({ url: 'https://light.test/manor/index.html?bridge=fixture', method: 'GET', mode: 'navigate' }, Promise.resolve(response));
    expect(await respond.mock.calls[0][0]).toBe(response);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('原有离线图标继续读取离线缓存', async () => {
    const h = harness(), request = new Request('https://light.test/icon-192.png?v=7');
    const respond = h.dispatch(request);
    expect(await (await respond.mock.calls[0][0]).text()).toBe('offline asset');
    expect(h.match).toHaveBeenCalledExactlyOnceWith(request, { ignoreSearch: true });
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
