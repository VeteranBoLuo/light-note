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
function setup(mounted = true) {
  document.body.innerHTML =
    '<div id="app"><section class="garden-scene"><span id="paint"></span></section></div><div id="modal"></div>';
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
    module = {
      exports: {} as { ready: () => Promise<boolean>; mounted: () => void; track: (p: Promise<void>) => void },
    };
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
    performance: { mark, now: () => 123 },
    requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
    getComputedStyle: (node: Element) => ({
      backgroundImage: node.id === 'paint' ? 'url("http://localhost/paint.webp")' : 'none',
      maskImage: 'none',
    }),
  });
  if (mounted) module.exports.mounted();
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
    document.head.querySelectorAll('[data-manor-test]').forEach((node) => node.remove());
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
  it('后台或锁屏暂停渲染时不误报失败，回到前台后继续按真实资源就绪', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const startup = setup(), ready = startup.ready();
    await vi.advanceTimersByTimeAsync(60000);
    expect(startup.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'load-error' }), expect.anything());
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    startup.loaded[0].onload(); startup.decoded.resolve();
    await vi.advanceTimersByTimeAsync(10);
    expect(await ready).toBe(true);
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
  it('脚本下载完但界面未成功初始化时保留错误界面', async () => {
    const startup = setup(false);
    expect(await startup.ready()).toBe(false);
    expect(startup.loaded).toHaveLength(0);
    expect(startup.mark).not.toHaveBeenCalled();
  });
  it('样式未能加载时不能把未着色的场景报告为可用', async () => {
    const startup = setup(),
      link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.manorTest = 'true';
    document.head.append(link);
    expect(await startup.ready()).toBe(false);
    expect(startup.loaded).toHaveLength(0);
    expect(startup.mark).not.toHaveBeenCalled();
  });
  it('界面与宿主桥接共享同一次准备，不重复推进进度', async () => {
    const startup = setup(),
      first = startup.ready(),
      second = startup.ready();
    expect(first).toBe(second);
    expect(startup.loaded).toHaveLength(1);
    startup.loaded[0].onload();
    startup.decoded.resolve();
    await vi.advanceTimersByTimeAsync(10);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(document.querySelector('.garden-loader')?.getAttribute('aria-valuenow')).toBe('100');
    expect(startup.mark).toHaveBeenCalledTimes(1);
  });
});
