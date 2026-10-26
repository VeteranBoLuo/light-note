import { createApp, h, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AvatarFramePreview from './AvatarFramePreview.vue';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span class="portrait-placeholder" />' },
}));
vi.mock('./AvatarFrameSubjectMotion.vue', () => ({ default: { template: '<span class="subject-placeholder" />' } }));
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.unstubAllGlobals();
});

function mount(pauseWhenOffscreen: boolean) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h(AvatarFramePreview, { src: '', frameId: 'frame_streak_eternal', pauseWhenOffscreen }),
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('头像框素材按可见范围加载', () => {
  it('离屏只留头像，接近后挂载图层，离屏保留图层并暂停动效', async () => {
    const observers: Array<{
      callback: IntersectionObserverCallback;
      margin: string;
      disconnect: ReturnType<typeof vi.fn>;
    }> = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        disconnect = vi.fn();
        observe = vi.fn();
        constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
          observers.push({ callback, margin: options.rootMargin || '', disconnect: this.disconnect });
        }
      },
    );
    const host = mount(true);
    const originalSize = host.firstElementChild?.getAttribute('style');
    expect(host.querySelector('.avatar-frame__portrait')).not.toBeNull();
    expect(host.querySelector('.avatar-frame__canvas')).toBeNull();
    const assets = observers.find((item) => item.margin === '200px 0px')!;
    assets.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await nextTick();
    expect(host.querySelector('.avatar-frame__wing-layer')).not.toBeNull();
    expect(host.firstElementChild?.getAttribute('style')).toBe(originalSize);
    expect(assets.disconnect).toHaveBeenCalled();
    const motion = observers.find((item) => item.margin === '24px 0px')!;
    motion.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    await nextTick();
    expect(host.querySelector('.avatar-frame--motion-paused')).toBeNull();
    motion.callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    await nextTick();
    expect(host.querySelector('.avatar-frame__wing-layer')).not.toBeNull();
    expect(host.querySelector('.avatar-frame--motion-paused')).not.toBeNull();
  });
  it.each([false, true])('不支持观察器时仍正常显示（离屏模式 %s）', (pauseWhenOffscreen) => {
    vi.stubGlobal('IntersectionObserver', undefined);
    expect(mount(pauseWhenOffscreen).querySelector('.avatar-frame__wing-layer')).not.toBeNull();
  });
});
