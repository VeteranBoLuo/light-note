import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp, h, nextTick, ref, type Ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import type { ImageViewerItem } from '@/types/imageViewer';
import viewerSource from './BImageViewer.vue?raw';
import BImageViewer from './BImageViewer.vue';

const themeSource = readFileSync(resolve(process.cwd(), 'src/assets/css/theme.less'), 'utf8');

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: {
    props: ['src'],
    template: '<span class="svg-icon-stub" :data-src="src" />',
  },
}));

const images: ImageViewerItem[] = [
  { id: 'one', src: '/images/one.png', width: 1200, height: 800, alt: '第一张' },
  { id: 'two', src: '/images/two.png', width: 720, height: 1280, alt: '第二张' },
  { id: 'three', src: '/images/three.png', width: 320, height: 180, alt: '第三张' },
];

let cleanup: (() => void) | undefined;

async function mountViewer(
  viewerImages: Ref<ImageViewerItem[]> = ref([...images]),
  initialId: string | Ref<string> = 'one',
) {
  const host = document.createElement('div');
  document.body.append(host);
  const visible = ref(true);
  const app = createApp({
    setup() {
      return () =>
        h(BImageViewer, {
          visible: visible.value,
          images: viewerImages.value,
          initialId: typeof initialId === 'string' ? initialId : initialId.value,
          'onUpdate:visible': (value: boolean) => {
            visible.value = value;
          },
        });
    },
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
      missingWarn: false,
      fallbackWarn: false,
    }),
  );
  app.mount(host);
  await nextTick();
  await nextTick();
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, visible, viewerImages };
}

function currentImage() {
  return document.body.querySelector<HTMLImageElement>('.b-image-viewer__image');
}

function dispatchPointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  point: { clientX: number; clientY: number; pointerId?: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: point.clientX,
    clientY: point.clientY,
  });
  Object.defineProperties(event, {
    pointerId: { configurable: true, value: point.pointerId || 1 },
    pointerType: { configurable: true, value: 'mouse' },
  });
  target.dispatchEvent(event);
  return event;
}

function dispatchTouch(
  target: Element,
  type: 'touchstart' | 'touchmove' | 'touchend',
  points: Array<{ clientX: number; clientY: number }>,
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { configurable: true, value: points });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.useRealTimers();
  document.documentElement.style.zoom = '';
  document.documentElement.classList.remove('disable-animations');
});

describe('BImageViewer', () => {
  it('不依赖 transitionend 建立图片和关闭事件，减少动画时仍可展示并关闭', async () => {
    vi.useFakeTimers();
    document.documentElement.classList.add('disable-animations');
    const { visible } = await mountViewer();

    expect(currentImage()?.src).toContain('/images/one.png');
    expect(viewerSource).not.toContain('transitionend');
    expect(viewerSource).not.toContain('viewerjs');

    document.body.querySelector<HTMLButtonElement>(`button[aria-label="${zhCN.common.close}"]`)?.click();
    await vi.advanceTimersByTimeAsync(250);
    await nextTick();

    expect(visible.value).toBe(false);
    expect(document.body.querySelector('.b-image-viewer-modal')).toBeNull();
  });

  it('从指定图片打开，并支持键盘按序切换以及动态序列保持当前项', async () => {
    const viewerImages = ref([...images]);
    await mountViewer(viewerImages, 'two');

    expect(currentImage()?.src).toContain('/images/two.png');
    expect(document.body.textContent).toContain('2 / 3');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await nextTick();
    expect(currentImage()?.src).toContain('/images/three.png');

    viewerImages.value = [{ id: 'zero', src: '/images/zero.png', width: 300, height: 300 }, ...viewerImages.value];
    await nextTick();
    await nextTick();
    expect(currentImage()?.src).toContain('/images/three.png');
    expect(document.body.textContent).toContain('4 / 4');
  });

  it('打开期间初始项变化时切到指定图片', async () => {
    const initialId = ref('one');
    await mountViewer(ref([...images]), initialId);

    initialId.value = 'three';
    await nextTick();
    await nextTick();

    expect(currentImage()?.src).toContain('/images/three.png');
    expect(document.body.textContent).toContain('3 / 3');
  });

  it('单图或序列边界不吞掉用于浏览放大图片的方向键', async () => {
    await mountViewer(ref([images[0]]));
    const singleImageArrow = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(singleImageArrow);

    expect(singleImageArrow.defaultPrevented).toBe(false);
    expect(currentImage()?.src).toContain('/images/one.png');
  });

  it('只在明确按 Tab 时显示焦点，方向键与关闭不高亮画布、自动聚焦按钮或弹框根节点', async () => {
    await mountViewer();
    const viewport = document.body.querySelector<HTMLElement>('.b-image-viewer__viewport');
    const modal = document.body.querySelector<HTMLElement>('.b-image-viewer-modal');
    const initialFocus = document.activeElement;

    expect(viewport).not.toBeNull();
    expect(modal).not.toBeNull();
    expect(initialFocus).not.toBe(viewport);
    expect(modal?.classList.contains('is-keyboard-tabbing')).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    await nextTick();
    expect(modal?.classList.contains('is-keyboard-tabbing')).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await nextTick();

    expect(document.activeElement).toBe(initialFocus);
    expect(currentImage()?.src).toContain('/images/two.png');
    expect(modal?.classList.contains('is-keyboard-tabbing')).toBe(false);
    expect(viewerSource).not.toContain('initial-focus=".b-image-viewer__viewport"');
    expect(viewerSource).not.toContain('viewportRef.value?.focus');
    expect(viewerSource).toMatch(/\.b-image-viewer-modal :focus-visible\s*\{[\s\S]*?outline:\s*none !important;/u);
    expect(viewerSource).toMatch(
      /\.b-image-viewer-modal:focus,[\s\S]*?\.b-image-viewer-modal:focus-visible\s*\{[\s\S]*?outline:\s*none !important;/u,
    );
    expect(viewerSource).toMatch(
      /\.b-image-viewer-modal\.is-keyboard-tabbing :focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--image-viewer-focus-ring-color\) !important;/u,
    );
    expect(viewerSource).toMatch(
      /\.b-image-viewer-modal\.out \.b-image-viewer__viewport:focus-visible\s*\{[\s\S]*?box-shadow:\s*none;/u,
    );
  });

  it('显式覆盖加载、失败、重试和空数据状态', async () => {
    await mountViewer();
    expect(document.body.textContent).toContain(zhCN.common.imageViewer.loading);
    expect(
      document.body.querySelector<HTMLButtonElement>(`button[aria-label="${zhCN.common.imageViewer.zoomIn}"]`)
        ?.disabled,
    ).toBe(true);

    currentImage()?.dispatchEvent(new Event('error'));
    await nextTick();
    expect(document.body.textContent).toContain(zhCN.common.imageViewer.loadFailed);
    expect(
      document.body.querySelector<HTMLButtonElement>(`button[aria-label="${zhCN.common.imageViewer.rotateRight}"]`)
        ?.disabled,
    ).toBe(true);

    const retryButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === zhCN.common.imageViewer.retry,
    );
    retryButton?.click();
    await nextTick();
    expect(document.body.textContent).toContain(zhCN.common.imageViewer.loading);
    expect(document.body.textContent).not.toContain(zhCN.common.imageViewer.loadFailed);

    cleanup?.();
    cleanup = undefined;
    await mountViewer(ref([]));
    expect(document.body.textContent).toContain(zhCN.common.imageViewer.empty);
  });

  it('缩放、旋转和适应窗口共用同一变换状态，并保持当前图片', async () => {
    await mountViewer(ref([...images]), 'two');
    currentImage()?.dispatchEvent(new Event('load'));
    await nextTick();
    document.body.querySelector<HTMLButtonElement>(`button[aria-label="${zhCN.common.imageViewer.zoomIn}"]`)?.click();
    document.body
      .querySelector<HTMLButtonElement>(`button[aria-label="${zhCN.common.imageViewer.rotateRight}"]`)
      ?.click();
    await nextTick();

    expect(document.body.textContent).toContain('120%');
    expect(currentImage()?.getAttribute('style')).toContain('rotate(90deg)');
    expect(currentImage()?.src).toContain('/images/two.png');

    document.body.querySelector<HTMLButtonElement>(`button[aria-label="${zhCN.common.imageViewer.fit}"]`)?.click();
    await nextTick();
    expect(document.body.textContent).toContain('100%');
    expect(currentImage()?.getAttribute('style')).toContain('rotate(0deg)');
  });

  it('适应窗口状态下支持移动端横向滑动切换图片', async () => {
    await mountViewer();
    const viewport = document.body.querySelector<HTMLElement>('.b-image-viewer__viewport');
    expect(viewport).not.toBeNull();
    if (!viewport) return;

    dispatchTouch(viewport, 'touchstart', [{ clientX: 260, clientY: 320 }]);
    const move = dispatchTouch(viewport, 'touchmove', [{ clientX: 150, clientY: 324 }]);
    dispatchTouch(viewport, 'touchend', []);
    await nextTick();

    expect(move.defaultPrevented).toBe(true);
    expect(currentImage()?.src).toContain('/images/two.png');
  });

  it('桌面放大后直接滚动原生视口，按根节点缩放换算且不在移动中写响应式位置', async () => {
    await mountViewer();
    currentImage()?.dispatchEvent(new Event('load'));
    await nextTick();
    const viewport = document.body.querySelector<HTMLElement>('.b-image-viewer__viewport');
    expect(viewport).not.toBeNull();
    if (!viewport) return;

    Object.defineProperties(viewport, {
      clientWidth: { configurable: true, value: 600 },
      clientHeight: { configurable: true, value: 400 },
      scrollWidth: { configurable: true, value: 900 },
      scrollHeight: { configurable: true, value: 700 },
    });
    window.dispatchEvent(new Event('resize'));
    await nextTick();

    const zoomIn = document.body.querySelector<HTMLButtonElement>(
      `button[aria-label="${zhCN.common.imageViewer.zoomIn}"]`,
    );
    zoomIn?.click();
    zoomIn?.click();
    await nextTick();
    viewport.scrollLeft = 300;
    viewport.scrollTop = 200;
    document.documentElement.style.zoom = '1.1';

    dispatchPointer(viewport, 'pointerdown', { clientX: 200, clientY: 180 });
    dispatchPointer(viewport, 'pointermove', { clientX: 310, clientY: 235 });
    await nextTick();

    expect(viewport.scrollLeft).toBeCloseTo(200);
    expect(viewport.scrollTop).toBeCloseTo(150);
    expect(viewport.classList.contains('is-pointer-panning')).toBe(true);
    expect(viewerSource).toContain('viewport.scrollLeft = state.scrollLeft');
    expect(viewerSource).not.toMatch(/handlePointerMove[\s\S]*?position\.value\s*=/u);

    dispatchPointer(viewport, 'pointerup', { clientX: 310, clientY: 235 });
    await nextTick();
    expect(viewport.classList.contains('is-pointer-panning')).toBe(false);
  });

  it('图片只用旋转 transform，缩放由真实尺寸承担且拖动期间没有 transform 过渡', () => {
    expect(viewerSource).toContain('resolveImageViewportLayout');
    expect(viewerSource).toContain('width: imageLayout.value.imageWidth');
    expect(viewerSource).toContain('transform: `rotate(${rotation.value}deg)`');
    expect(viewerSource).not.toContain('transform 120ms');
    expect(viewerSource).toMatch(/\.b-image-viewer__image\s*\{[\s\S]*?transition:\s*opacity 120ms ease;/u);
  });

  it('桌面端扩大默认画布并压缩固定工具区域，把更多空间留给图片', () => {
    expect(viewerSource).toContain('width="min(1600px, calc(100vw - 48px))"');
    expect(viewerSource).toContain('height="min(1080px, calc(100vh - 32px))"');
    expect(viewerSource).toMatch(
      /\.b-image-viewer__viewport\s*\{[\s\S]*?--b-image-viewer-padding-x:\s*32px;[\s\S]*?--b-image-viewer-padding-top:\s*16px;/u,
    );
    expect(viewerSource).toMatch(
      /\.b-image-viewer__toolbar\s*\{[\s\S]*?min-height:\s*50px;[\s\S]*?\.b-image-viewer__toolbar \.b_btn\s*\{[\s\S]*?width:\s*32px;[\s\S]*?height:\s*32px;/u,
    );
  });

  it('移动端保持紧凑工具栏，同时复用全局 44px 触控尺寸', () => {
    expect(viewerSource).toContain('grid-template-columns: var(--mobile-touch-size) 1fr var(--mobile-touch-size);');
    expect(viewerSource).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.b-image-viewer__toolbar\s*\{[\s\S]*?min-height:\s*54px;[\s\S]*?gap:\s*3px;[\s\S]*?\.b-image-viewer__toolbar \.b_btn\s*\{[\s\S]*?width:\s*var\(--mobile-touch-size\);[\s\S]*?height:\s*var\(--mobile-touch-size\);/u,
    );
  });

  it('查看器配色只消费主题语义变量，并为浅色与深色主题分别声明完整取值', () => {
    const themeVariables = [
      '--image-viewer-mask-bg',
      '--image-viewer-shell-bg',
      '--image-viewer-chrome-bg',
      '--image-viewer-stage-bg',
      '--image-viewer-border-color',
      '--image-viewer-divider-color',
      '--image-viewer-text-color',
      '--image-viewer-muted-color',
      '--image-viewer-control-bg',
      '--image-viewer-control-hover-bg',
      '--image-viewer-control-border-color',
      '--image-viewer-nav-bg',
      '--image-viewer-nav-hover-bg',
      '--image-viewer-focus-ring-color',
      '--image-viewer-shadow',
    ];

    themeVariables.forEach((variable) => {
      expect(themeSource.match(new RegExp(`${variable}:`, 'gu'))).toHaveLength(2);
      expect(viewerSource).toContain(`var(${variable})`);
    });
    const styleSource = viewerSource.slice(viewerSource.indexOf('<style'));
    expect(styleSource).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/iu);
  });

  it('全屏 API 被拒绝时保留页面内降级，并让 Escape 先退出全屏而不关闭预览', async () => {
    const originalRequestFullscreen = Object.getOwnPropertyDescriptor(document.documentElement, 'requestFullscreen');
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('fullscreen denied')),
    });

    try {
      await mountViewer();
      document.body
        .querySelector<HTMLButtonElement>(`button[aria-label="${zhCN.common.imageViewer.enterFullscreen}"]`)
        ?.click();
      await Promise.resolve();
      await nextTick();
      expect(document.body.querySelector('.b-image-viewer-modal')?.classList.contains('is-fullscreen')).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await nextTick();
      expect(document.body.querySelector('.b-image-viewer-modal')?.classList.contains('is-fullscreen')).toBe(false);
      expect(document.body.querySelector('.b-image-viewer-modal')).not.toBeNull();
    } finally {
      if (originalRequestFullscreen) {
        Object.defineProperty(document.documentElement, 'requestFullscreen', originalRequestFullscreen);
      } else {
        delete (document.documentElement as HTMLElement & { requestFullscreen?: () => Promise<void> })
          .requestFullscreen;
      }
    }
  });
});
