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
function setup(mounted = true, asset?: { path: string; fetcher: typeof fetch; bay?: boolean }, idle?: ReturnType<typeof vi.fn>, hostLoader = true, host?: ReturnType<typeof sharedHost>) {
  document.head.querySelectorAll('[data-manor-test]').forEach(node => node.remove());
  document.body.innerHTML =
    '<div id="app"><section class="garden-scene"><span id="paint"></span></section></div><div id="modal"></div>';
  if(asset){
    const manifest=document.createElement('script');manifest.type='application/json';manifest.id='manor-boot-images';manifest.dataset.manorTest='true';
    manifest.textContent=JSON.stringify({desktop:[{src:asset.path,variable:'--manor-test-image'}],...(asset.bay?{mobileBay:[{src:asset.path},{src:'http://localhost/manor/bay.webp'}]}:{})});document.head.append(manifest);
  }
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
    win = new EventTarget(),
    mark = vi.fn(),
    module = {
      exports: {} as { ready: () => Promise<boolean>; mounted: () => void; track: (p: Promise<void>) => void; afterReady: (run: () => void, options?: {idle?: boolean}) => void; assetsReady: Promise<boolean>; html: (markup: string) => string; prepareArea: (area: string, background?: boolean) => Promise<boolean> },
    };
  let blobId=0;
  runInNewContext(source, {
    document,
    window: win,
    parent: host ? Object.assign(host, { postMessage }) : { postMessage },
    location: { search: `?bridge=fixture${hostLoader ? '&loader=host' : ''}`, origin: 'http://localhost' },
    URL: class extends URL { static createObjectURL() { return 'blob:http://localhost/critical'+(blobId++||''); } },
    URLSearchParams,
    Image,
    fetch: asset?.fetcher,
    AbortController,
    innerWidth: 1003,
    innerHeight: 700,
    devicePixelRatio: 2,
    module,
    setTimeout,
    clearTimeout,
    performance: { mark, now: () => 123 },
    requestAnimationFrame: (fn: () => void) => setTimeout(fn, 0),
    requestIdleCallback: idle,
    getComputedStyle: (node: Element) => ({
      backgroundImage: node.id === 'paint' ? `url("${asset?.path || 'http://localhost/paint.webp'}")` : 'none',
      maskImage: 'none',
    }),
  });
  if (mounted) module.exports.mounted();
  return { ...module.exports, loaded, decoded, postMessage, mark, leave: () => win.dispatchEvent(new Event('pagehide')) };
}
function sharedHost() {
  let serial=0;
  return { location:{origin:'http://localhost'}, Map, Object,
    URL:{createObjectURL:vi.fn(()=>`blob:http://localhost/host-${++serial}`),revokeObjectURL:vi.fn()},
    __LIGHTNOTE_MANOR_IMAGES_V1__:new Map<string,{url:string;bytes:number;refs:number;used:number}>() };
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
    document.documentElement.style.removeProperty('--manor-test-image');
    delete document.documentElement.dataset.assetBytes;delete document.documentElement.dataset.sceneSource;
    delete document.documentElement.dataset.cachedAssets;delete document.documentElement.dataset.startupPhase;
  });
  it('嵌入时只向宿主报告真实进度，不再显示第二层加载页', async () => {
    const startup = setup(), water = deferred();
    startup.track(water.promise);
    const ready = startup.ready();
    expect((document.querySelector('.garden-loader') as HTMLElement).style.display).toBe('none');
    await vi.advanceTimersByTimeAsync(9000);
    expect(startup.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ action: 'progress', payload: { percent: 100 } }), expect.anything());
    startup.loaded[0].onload(); startup.decoded.resolve();
    await vi.advanceTimersByTimeAsync(1);
    expect(startup.postMessage).toHaveBeenCalledWith(expect.objectContaining({ action: 'progress', payload: { percent: 33 } }), 'http://localhost');
    water.resolve(); await vi.advanceTimersByTimeAsync(10);
    expect(await ready).toBe(true);
    const messages = startup.postMessage.mock.calls.map(([message]) => message);
    expect(messages.at(-2)).toMatchObject({ action: 'progress', payload: { percent: 100 } });
    expect(messages.at(-1)).toMatchObject({ action: 'ready' });
  });
  it('未声明统一加载能力的旧宿主保留场景自己的加载页', () => {
    setup(true, undefined, undefined, false);
    expect((document.querySelector('.garden-loader') as HTMLElement).style.display).toBe('');
  });
  it('关键贴图只下载一次，CSS、DOM 和就绪检查复用同一个解码资源', async () => {
    const path='http://localhost/manor/paint.webp';
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'image/webp'}}));
    const startup=setup(true,{path,fetcher});
    await vi.advanceTimersByTimeAsync(1);
    expect(startup.loaded).toHaveLength(1);
    expect(document.querySelector('.garden-loader')?.getAttribute('aria-valuenow')).toBe('0');
    startup.loaded[0].onload();startup.decoded.resolve();
    expect(await startup.assetsReady).toBe(true);
    const decodedProgress=Number(document.querySelector('.garden-loader')?.getAttribute('aria-valuenow'));
    expect(decodedProgress).toBeGreaterThan(0);expect(decodedProgress).toBeLessThan(100);
    const ready=startup.ready();await vi.advanceTimersByTimeAsync(10);
    expect(await ready).toBe(true);expect(startup.loaded).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(path,expect.objectContaining({credentials:'omit',cache:'force-cache'}));
    expect(startup.html(`<img src="${path}">`)).toContain('src="blob:http://localhost/critical"');
    expect(document.documentElement.style.getPropertyValue('--manor-test-image')).toContain('blob:http://localhost/critical');
  });
  it('再次进入复用宿主创建的公开素材地址，仍等待图片可用后才推进真实进度', async () => {
    const host=sharedHost(),path='http://localhost/manor/paint-r1.webp';
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'image/webp'}}));
    const first=setup(true,{path,fetcher},undefined,true,host);
    await vi.advanceTimersByTimeAsync(1);first.loaded[0].onload();first.decoded.resolve();
    expect(await first.assetsReady).toBe(true);
    const entry=host.__LIGHTNOTE_MANOR_IMAGES_V1__.get(path)!;
    expect(Object.getPrototypeOf(entry)).toBeNull();
    expect(entry.refs).toBe(1);first.leave();expect(entry.refs).toBe(0);
    const second=setup(true,{path,fetcher},undefined,true,host);
    await vi.advanceTimersByTimeAsync(1);
    expect(second.loaded[0].src).toBe(entry.url);
    expect(document.querySelector('.garden-loader')?.getAttribute('aria-valuenow')).toBe('0');
    second.loaded[0].onload();second.decoded.resolve();
    expect(await second.assetsReady).toBe(true);
    expect(document.documentElement.dataset.cachedAssets).toBe('1');
    expect(fetcher).toHaveBeenCalledTimes(1);expect(host.URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(host.URL.revokeObjectURL).not.toHaveBeenCalled();
    second.leave();expect(entry.refs).toBe(0);
  });
  it('旧缓存解码失败会释放地址，重试重新下载，不永久缓存坏图片', async () => {
    const host=sharedHost(),path='http://localhost/manor/paint-r1.webp',fetcher=vi.fn<typeof fetch>();
    host.__LIGHTNOTE_MANOR_IMAGES_V1__.set(path,{url:'blob:http://localhost/broken',bytes:2,refs:0,used:0});
    const startup=setup(true,{path,fetcher},undefined,true,host);
    startup.loaded[0].onerror();
    expect(await startup.assetsReady).toBe(false);
    expect(host.__LIGHTNOTE_MANOR_IMAGES_V1__.has(path)).toBe(false);
    expect(host.URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/broken');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('素材池按容量淘汰空闲地址，正在使用的场景地址保持有效', async () => {
    const host=sharedHost(),path='http://localhost/manor/paint-r1.webp';
    for(let i=0;i<50;i++)host.__LIGHTNOTE_MANOR_IMAGES_V1__.set(`old-${i}`,{url:`blob:old-${i}`,bytes:1024*1024,refs:i===0?1:0,used:i});
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'image/webp'}}));
    const startup=setup(true,{path,fetcher},undefined,true,host);
    await vi.advanceTimersByTimeAsync(1);startup.loaded[0].onload();startup.decoded.resolve();
    expect(await startup.assetsReady).toBe(true);
    const cache=host.__LIGHTNOTE_MANOR_IMAGES_V1__;
    expect([...cache.values()].reduce((n,e)=>n+e.bytes,0)).toBeLessThanOrEqual(12*1024*1024);
    expect(cache.size).toBeLessThanOrEqual(48);
    expect(cache.has('old-0')).toBe(true);expect(cache.has(path)).toBe(true);
    expect(host.URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:old-0');
    expect(host.URL.revokeObjectURL).toHaveBeenCalledWith('blob:old-1');
  });
  it('无版本图片不进入跨场景素材池，继续使用原有 HTTP 请求路径', async () => {
    const host=sharedHost(),path='http://localhost/manor/paint.webp';
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'image/webp'}}));
    for(let visit=0;visit<2;visit++){
      const startup=setup(true,{path,fetcher},undefined,true,host);
      await vi.advanceTimersByTimeAsync(1);startup.loaded[0].onload();startup.decoded.resolve();
      expect(await startup.assetsReady).toBe(true);startup.leave();
    }
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(host.__LIGHTNOTE_MANOR_IMAGES_V1__.size).toBe(0);
  });
  it('关键素材清单不得下载 API 或跨域账号数据', async () => {
    const fetcher=vi.fn<typeof fetch>(),startup=setup(true,{path:'http://localhost/api/growth/manor',fetcher});
    expect(await startup.assetsReady).toBe(false);expect(fetcher).not.toHaveBeenCalled();
    expect(startup.mark).not.toHaveBeenCalled();
  });
  it('手机区域预取和点击切换复用同一份在途下载，公共素材不重复请求', async () => {
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>new Response(new Uint8Array([1,2]),{headers:{'Content-Type':'image/webp'}}));
    const startup=setup(true,{path:'http://localhost/manor/paint.webp',fetcher,bay:true});
    await vi.advanceTimersByTimeAsync(1);startup.loaded[0].onload();startup.decoded.resolve();
    expect(await startup.assetsReady).toBe(true);
    const background=startup.prepareArea('bay',true),foreground=startup.prepareArea('bay');
    await vi.advanceTimersByTimeAsync(1);expect(startup.loaded).toHaveLength(2);startup.loaded[1].onload();
    expect(await background).toBe(true);expect(await foreground).toBe(true);
    expect(fetcher.mock.calls.map(([path])=>path)).toEqual(['http://localhost/manor/paint.webp','http://localhost/manor/bay.webp']);
  });
  it('装饰动物等到核心画面与操作准备好后才开始；失败时不启动后台工作', async () => {
    const startup = setup(), wildlife = vi.fn();
    startup.afterReady(wildlife);
    const ready = startup.ready();
    await vi.advanceTimersByTimeAsync(9000);
    expect(wildlife).not.toHaveBeenCalled();
    startup.loaded[0].onload(); startup.decoded.resolve();
    await vi.advanceTimersByTimeAsync(10);
    expect(await ready).toBe(true);
    expect(wildlife).toHaveBeenCalledTimes(1);
  });
  it('核心素材失败后不启动已排队的装饰工作', async () => {
    const startup = setup(), wildlife = vi.fn();
    startup.afterReady(wildlife);
    const ready = startup.ready();
    startup.loaded[0].onerror();
    expect(await ready).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(wildlife).not.toHaveBeenCalled();
  });
  it('区域的轻量动物不等待繁忙内核的 idle，3D 增强仍留在空闲队列', async () => {
    const idle=vi.fn(),startup=setup(true,undefined,idle),visitors=vi.fn(),enhancement=vi.fn();
    startup.afterReady(visitors,{idle:false});startup.afterReady(enhancement);
    const ready=startup.ready();
    startup.loaded[0].onload();startup.decoded.resolve();await vi.advanceTimersByTimeAsync(10);
    expect(await ready).toBe(true);expect(visitors).toHaveBeenCalledOnce();
    expect(enhancement).not.toHaveBeenCalled();expect(idle).toHaveBeenCalledWith(enhancement,{timeout:1000});
    const nextArea=vi.fn();startup.afterReady(nextArea,{idle:false});await vi.advanceTimersByTimeAsync(1);
    expect(nextArea).toHaveBeenCalledOnce();expect(idle).toHaveBeenCalledTimes(1);
    idle.mock.calls[0][0]();expect(enhancement).toHaveBeenCalledOnce();
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
