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
    contentType: 'image/webp',
    fileSize: 11,
    width: 720,
    height: 1280,
  },
];

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

describe('ChatImageViewerModal', () => {
  it('只负责把聊天图片映射给共享 BImageViewer，不再维护第二套预览状态机', () => {
    expect(viewerSource).toContain('<BImageViewer');
    expect(viewerSource).toContain('id: item.publicId');
    expect(viewerSource).toContain('src: item.url');
    expect(viewerSource).not.toContain('<BModal');
    expect(viewerSource).not.toContain('handlePointerMove');
    expect(viewerSource).not.toContain('transform 120ms');
  });

  it('保留指定图片打开和聊天图片序列切换能力', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const visible = ref(true);
    const app = createApp({
      setup() {
        return () =>
          h(ChatImageViewerModal, {
            visible: visible.value,
            images,
            initialPublicId: 'image-2',
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

    expect(document.body.querySelector<HTMLImageElement>('.b-image-viewer__image')?.src).toContain(
      '/api/community-chat/images/image-2',
    );
    expect(document.body.textContent).toContain('2 / 2');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    await nextTick();
    expect(document.body.querySelector<HTMLImageElement>('.b-image-viewer__image')?.src).toContain(
      '/api/community-chat/images/image-1',
    );
  });
});
