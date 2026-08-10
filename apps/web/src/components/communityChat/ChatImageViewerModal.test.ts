import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import type { CommunityChatImage } from '@/api/communityChatApi';
import viewerSource from './ChatImageViewerModal.vue?raw';
import ChatImageViewerModal from './ChatImageViewerModal.vue';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: {
    props: ['src'],
    template: '<span class="svg-icon-stub" :data-src="src" />',
  },
}));

const images: CommunityChatImage[] = [
  {
    publicId: 'image-1',
    url: '/api/community-chat/images/image-1',
    contentType: 'image/png',
    fileSize: 10,
    width: 640,
    height: 480,
  },
  {
    publicId: 'image-2',
    url: '/api/community-chat/images/image-2',
    contentType: 'image/jpeg',
    fileSize: 11,
    width: 800,
    height: 600,
  },
  {
    publicId: 'image-3',
    url: '/api/community-chat/images/image-3',
    contentType: 'image/webp',
    fileSize: 12,
    width: 720,
    height: 1280,
  },
];

let cleanup: (() => void) | undefined;

async function mountViewer(initialPublicId = 'image-1') {
  const host = document.createElement('div');
  document.body.append(host);
  const visible = ref(true);
  const viewerImages = ref([...images]);
  const app = createApp({
    setup() {
      return () =>
        h(ChatImageViewerModal, {
          visible: visible.value,
          images: viewerImages.value,
          initialPublicId,
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
  return { host, viewerImages };
}

function currentImage() {
  return document.body.querySelector<HTMLImageElement>('.chat-image-viewer__image');
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

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('ChatImageViewerModal', () => {
  it('把桌面切换箭头定位在 Tooltip 包裹层，并精简移动端旋转工具', () => {
    expect(viewerSource).toMatch(
      /\.chat-image-viewer__nav-wrap\s*\{[\s\S]*?position:\s*absolute\s*!important;[\s\S]*?top:\s*50%\s*!important;/u,
    );
    expect(viewerSource).toContain('chat-image-viewer__nav-wrap--previous');
    expect(viewerSource).toContain('chat-image-viewer__nav-wrap--next');
    expect(viewerSource).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.chat-image-viewer__tool--rotate-left\s*\{[\s\S]*?display:\s*none\s*!important;/u,
    );
    expect(viewerSource).toContain(':src="icon.cloudSpace.preview.fitPage"');
  });

  it('从指定图片打开，并用左右与上下方向键切换当前聊天图片', async () => {
    await mountViewer('image-2');

    expect(currentImage()?.src).toContain('/api/community-chat/images/image-2');
    expect(document.body.textContent).toContain('2 / 3');
    expect(document.body.textContent).not.toContain('使用方向键切换图片');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await nextTick();
    expect(currentImage()?.src).toContain('/api/community-chat/images/image-3');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    await nextTick();
    expect(currentImage()?.src).toContain('/api/community-chat/images/image-2');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await nextTick();
    expect(currentImage()?.src).toContain('/api/community-chat/images/image-3');
  });

  it('移动端在原始缩放下左右滑动切换图片', async () => {
    await mountViewer('image-1');
    const stage = document.body.querySelector<HTMLElement>('.chat-image-viewer__stage');
    expect(stage).not.toBeNull();
    if (!stage) return;

    dispatchTouch(stage, 'touchstart', [{ clientX: 240, clientY: 320 }]);
    dispatchTouch(stage, 'touchmove', [{ clientX: 130, clientY: 324 }]);
    dispatchTouch(stage, 'touchend', []);
    await nextTick();

    expect(currentImage()?.src).toContain('/api/community-chat/images/image-2');

    dispatchTouch(stage, 'touchstart', [{ clientX: 120, clientY: 320 }]);
    dispatchTouch(stage, 'touchmove', [{ clientX: 220, clientY: 318 }]);
    dispatchTouch(stage, 'touchend', []);
    await nextTick();

    expect(currentImage()?.src).toContain('/api/community-chat/images/image-1');
  });

  it('已加载图片序列增加时更新数量并保持当前图片', async () => {
    const { viewerImages } = await mountViewer('image-2');
    expect(currentImage()?.src).toContain('/api/community-chat/images/image-2');
    expect(document.body.textContent).toContain('2 / 3');

    viewerImages.value = [
      {
        publicId: 'image-older',
        url: '/api/community-chat/images/image-older',
        contentType: 'image/png',
        fileSize: 9,
        width: 480,
        height: 360,
      },
      ...viewerImages.value,
    ];
    await nextTick();
    await nextTick();

    expect(currentImage()?.src).toContain('/api/community-chat/images/image-2');
    expect(document.body.textContent).toContain('3 / 4');
  });

  it('放大、旋转和还原操作更新图片变换且不切换当前图片', async () => {
    await mountViewer('image-2');
    const zoomIn = document.body.querySelector<HTMLButtonElement>(
      `button[aria-label="${zhCN.communityChat.image.zoomIn}"]`,
    );
    const rotateRight = document.body.querySelector<HTMLButtonElement>(
      `button[aria-label="${zhCN.communityChat.image.rotateRight}"]`,
    );
    const reset = document.body.querySelector<HTMLButtonElement>(
      `button[aria-label="${zhCN.communityChat.image.reset}"]`,
    );

    zoomIn?.click();
    rotateRight?.click();
    await nextTick();
    expect(currentImage()?.getAttribute('style')).toContain('scale(1.25) rotate(90deg)');
    expect(currentImage()?.src).toContain('/api/community-chat/images/image-2');

    reset?.click();
    await nextTick();
    expect(currentImage()?.getAttribute('style')).toContain('scale(1) rotate(0deg)');
  });

  it('桌面端放大后可按住图片区域拖动查看不同部位', async () => {
    await mountViewer('image-2');
    const stage = document.body.querySelector<HTMLElement>('.chat-image-viewer__stage');
    const zoomIn = document.body.querySelector<HTMLButtonElement>(
      `button[aria-label="${zhCN.communityChat.image.zoomIn}"]`,
    );
    expect(stage).not.toBeNull();
    if (!stage) return;

    zoomIn?.click();
    await nextTick();
    dispatchPointer(stage, 'pointerdown', { clientX: 300, clientY: 260 });
    dispatchPointer(stage, 'pointermove', { clientX: 372, clientY: 314 });
    await nextTick();

    expect(currentImage()?.getAttribute('style')).toContain('translate(72px, 54px) scale(1.25)');
    expect(document.body.querySelector('.chat-image-viewer__canvas')?.classList.contains('is-pointer-panning')).toBe(
      true,
    );

    dispatchPointer(stage, 'pointerup', { clientX: 372, clientY: 314 });
    await nextTick();
    expect(document.body.querySelector('.chat-image-viewer__canvas')?.classList.contains('is-pointer-panning')).toBe(
      false,
    );
  });
});
