import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'public/manor/knowledge-garden-v19/garden-loader.js'), 'utf8');
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function setup() {
  document.body.innerHTML = '<div id="app"><span id="paint"></span></div><div id="modal"></div>';
  vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([
    { width: 100, height: 100 },
  ] as unknown as DOMRectList);
  const decoded = deferred(),
    loaded: { onload: () => void; onerror: () => void; src: string }[] = [];
  class Image {
    onload = () => {};
    onerror = () => {};
    src = '';
    decoding = '';
    constructor() {
      loaded.push(this);
    }
    decode() {
      return decoded.promise;
    }
  }
  const postMessage = vi.fn(),
    mark = vi.fn(),
    module = { exports: {} as { ready: () => Promise<boolean>; track: (p: Promise<void>) => void } };
  runInNewContext(source, {
    document,
    window: {},
    parent: { postMessage },
    location: { search: '?bridge=fixture', origin: 'http://localhost' },
    URL,
    URLSearchParams,
    Image,
    module,
    setTimeout,
    clearTimeout,
    performance: { mark },
    requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
    getComputedStyle: (node: Element) => ({
      backgroundImage: node.id === 'paint' ? 'url("http://localhost/paint.webp")' : 'none',
      maskImage: 'none',
    }),
  });
  return { ...module.exports, loaded, decoded, postMessage, mark };
}
describe('庄园真实启动进度', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.documentElement.classList.remove('garden-booting');
  });
  it('八秒不会放行未下载的场景；下载、解码和准备任务全部完成才可交互', async () => {
    const startup = setup(),
      water = deferred();
    startup.track(water.promise);
    const ready = startup.ready();
    expect(document.querySelector('.garden-loader')?.getAttribute('aria-valuenow')).toBe('0');
    await vi.advanceTimersByTimeAsync(9000);
    expect(document.querySelector('.garden-loader.leaving')).toBeNull();
    startup.loaded[0].onload();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.garden-loader')?.getAttribute('aria-valuenow')).toBe('0');
    startup.decoded.resolve();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.garden-loader')?.getAttribute('aria-valuenow')).toBe('33');
    water.resolve();
    await vi.advanceTimersByTimeAsync(10);
    expect(await ready).toBe(true);
    expect(document.querySelector('.garden-loader')?.getAttribute('aria-valuenow')).toBe('100');
    expect(startup.mark).toHaveBeenCalledWith('manor-interactive');
    await vi.advanceTimersByTimeAsync(450);
    expect(document.querySelector('.garden-loader')).toBeNull();
  });
  it('图片失败不报告完成，交给宿主提供重试与返回', async () => {
    const startup = setup(),
      ready = startup.ready();
    startup.loaded[0].onerror();
    expect(await ready).toBe(false);
    expect(startup.mark).not.toHaveBeenCalled();
    expect(document.querySelector('.garden-loader')?.getAttribute('aria-valuenow')).toBe('0');
    expect(startup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'load-error' }),
      'http://localhost',
    );
  });
  it('资源超时保留错误状态，不用时间填满进度条', async () => {
    const startup = setup(),
      ready = startup.ready();
    await vi.advanceTimersByTimeAsync(30000);
    expect(await ready).toBe(false);
    expect(document.querySelector('.garden-loader')?.textContent).toContain('场景未能载入');
    expect(startup.mark).not.toHaveBeenCalled();
  });
  it('场景里的图片加载失败时不能用另一个预加载图片冒充就绪', async () => {
    const startup = setup();
    document.getElementById('paint')?.remove();
    const img = document.createElement('img');
    img.src = '/broken.webp';
    Object.defineProperties(img, { complete: { value: true }, naturalWidth: { value: 0 } });
    document.getElementById('app')!.append(img);
    expect(await startup.ready()).toBe(false);
    expect(startup.loaded).toHaveLength(0);
    expect(startup.mark).not.toHaveBeenCalled();
  });
});
