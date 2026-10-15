import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Art from './ProfileBackgroundArt.vue';
import Surface from './ProfileBackgroundSurface.vue';
import { profileBackground } from '@/config/profileBackgrounds';
import { useProfileBackgroundMotion } from '@/composables/useProfileBackgroundMotion';
import { profileBackgroundsZh } from '@/i18n/locales/profileBackgrounds';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
const observers: Array<{ callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }> = [];
const resizeObservers: Array<{ callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }> = [];
let media: EventTarget & { matches: boolean };
let hidden = false;
let cleanups: Array<() => void> = [];

beforeEach(() => {
  hidden = false;
  media = Object.assign(new EventTarget(), { matches: false });
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal('matchMedia', () => media);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(callback: ResizeObserverCallback) {
        resizeObservers.push({ callback, disconnect: this.disconnect });
      }
    },
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      constructor(callback: IntersectionObserverCallback) {
        observers.push({ callback, disconnect: this.disconnect });
      }
    },
  );
});
afterEach(() => {
  cleanups.forEach((cleanup) => cleanup());
  cleanups = [];
  observers.length = 0;
  resizeObservers.length = 0;
  const motion = useProfileBackgroundMotion();
  if (motion.paused.value) motion.toggle();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount(thumbnail = false, surfaces = false) {
  const props = reactive({ backgroundId: 'background_stars', thumbnail });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      surfaces ? h('div', [h(Surface, props, () => '名片'), h(Surface, props, () => '主页')]) : h(Art, props),
  });
  app.use(
    createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': { profileBackgrounds: profileBackgroundsZh } } }),
  );
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  return { host, props, art: () => host.querySelector('.profile-background-art')! };
}
async function load(image: HTMLImageElement) {
  Object.defineProperty(image, 'naturalWidth', { value: 1600 });
  image.dispatchEvent(new Event('load'));
  await Promise.resolve();
  await nextTick();
}
async function show(index = 0, visible = true) {
  observers[index].callback([{ isIntersecting: visible } as IntersectionObserverEntry], {} as IntersectionObserver);
  await nextTick();
}

describe('个人背景渐进显示与动效', () => {
  it('图片加载前保持小图，完成后仅在可见时播放；后台、减少动态效果和离屏都暂停', async () => {
    const { host, art } = mount();
    expect(host.querySelector<HTMLElement>('.profile-background-art__scene')?.style.backgroundImage).toContain('url(');
    await show();
    expect(art().classList.contains('is-running')).toBe(false);
    await load(host.querySelector('img')!);
    expect(art().classList.contains('is-running')).toBe(true);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();
    expect(art().classList.contains('is-running')).toBe(false);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    media.matches = true;
    media.dispatchEvent(new Event('change'));
    await nextTick();
    expect(art().classList.contains('is-running')).toBe(false);
    media.matches = false;
    media.dispatchEvent(new Event('change'));
    await nextTick();
    expect(art().classList.contains('is-running')).toBe(true);
    await show(0, false);
    expect(art().classList.contains('is-running')).toBe(false);
  });
  it('商店只加载静态缩略图，不加载清晰图或挂载动效', () => {
    const { host } = mount(true);
    expect(host.querySelector('img')?.getAttribute('src')).toBe(profileBackground('background_stars')?.thumbnail);
    expect(host.querySelector('img')?.getAttribute('loading')).toBe('lazy');
    expect(host.querySelector('.profile-background-art__motion')).toBeNull();
    expect(observers).toHaveLength(0);
  });
  it('图片失败保留小图，快速切换后旧图片事件不能影响新背景；未知 ID 恢复默认', async () => {
    const { host, props, art } = mount();
    const oldImage = host.querySelector('img')!;
    oldImage.dispatchEvent(new Event('error'));
    await nextTick();
    expect(art().classList.contains('is-ready')).toBe(false);
    expect(host.querySelector<HTMLElement>('.profile-background-art__scene')?.style.backgroundImage).not.toBe('');
    props.backgroundId = 'background_mountains';
    await nextTick();
    await load(oldImage);
    expect(art().classList.contains('is-ready')).toBe(false);
    await load(host.querySelector('img')!);
    oldImage.dispatchEvent(new Event('error'));
    await nextTick();
    expect(art().classList.contains('is-ready')).toBe(true);
    expect(host.querySelector('.profile-background-art__motion')).toBeNull();
    props.backgroundId = 'unknown';
    await nextTick();
    expect(host.querySelector('.profile-background-art')).toBeNull();
  });
  it('名片与主页的查看者暂停状态同步，恢复播放不改变背景 ID', async () => {
    const { host, props } = mount(false, true);
    for (const image of host.querySelectorAll('img')) await load(image);
    await show(0);
    await show(1);
    const buttons = host.querySelectorAll('button');
    buttons[0].click();
    await nextTick();
    expect([...buttons].every((button) => button.textContent?.includes('播放背景动效'))).toBe(true);
    expect(host.querySelectorAll('.is-running')).toHaveLength(0);
    buttons[1].click();
    await nextTick();
    expect(host.querySelectorAll('.is-running')).toHaveLength(2);
    expect(props.backgroundId).toBe('background_stars');
    cleanups.splice(0).forEach((cleanup) => cleanup());
    expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
    expect(resizeObservers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
  });
  it('清晰图解码完成才显示并启用动效，旧图片的解码结果不会覆盖已切换的背景', async () => {
    const { host, props, art } = mount();
    await show();
    const oldImage = host.querySelector('img')!;
    let finishDecode!: () => void;
    oldImage.decode = () => new Promise<void>((resolve) => (finishDecode = resolve));
    await load(oldImage);
    expect(art().classList.contains('is-ready')).toBe(false);
    props.backgroundId = 'background_mountains';
    await nextTick();
    finishDecode();
    await Promise.resolve();
    await nextTick();
    expect(art().classList.contains('is-ready')).toBe(false);
    const nextImage = host.querySelector('img')!;
    nextImage.decode = vi.fn().mockRejectedValue(new Error('Decode failed'));
    await load(nextImage);
    expect(art().classList.contains('is-ready')).toBe(false);
    nextImage.decode = vi.fn().mockResolvedValue(undefined);
    nextImage.dispatchEvent(new Event('load'));
    await Promise.resolve();
    await nextTick();
    expect(art().classList.contains('is-ready')).toBe(true);
  });
  it('插画和动效共用裁切坐标，容器改变后保持 3:1 原图比例', async () => {
    const { host, art } = mount();
    Object.defineProperty(art(), 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(art(), 'clientHeight', { configurable: true, value: 200 });
    resizeObservers[0].callback([], {} as ResizeObserver);
    await nextTick();
    const scene = host.querySelector<HTMLElement>('.profile-background-art__scene')!;
    expect(scene.style.width).toBe('600px');
    expect(scene.style.height).toBe('200px');
    expect(scene.style.left).toBe('-156px');
    expect(scene.contains(host.querySelector('img'))).toBe(true);
    expect(scene.contains(host.querySelector('.profile-background-art__motion'))).toBe(true);
    Object.defineProperty(art(), 'clientWidth', { value: 900 });
    resizeObservers[0].callback([], {} as ResizeObserver);
    await nextTick();
    expect(scene.style.width).toBe('900px');
    expect(scene.style.height).toBe('300px');
    expect(scene.style.top).toBe('-50px');
  });
});
