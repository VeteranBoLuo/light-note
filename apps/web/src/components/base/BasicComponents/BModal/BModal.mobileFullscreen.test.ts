import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import { MOBILE_LAYOUT_CONTEXT } from '@/composables/useMobileLayout';
import BModal from './BModal.vue';

describe('BModal 移动全屏模式', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  function mountModal(isMobile: boolean) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const visible = ref(true);
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(
              BModal,
              {
                visible: visible.value,
                'onUpdate:visible': (value: boolean) => (visible.value = value),
                title: '用户预览',
                width: '92vw',
                height: 'calc(100vh - 64px)',
                fullscreenMobile: true,
                showFooter: false,
              },
              {
                default: () => h('div', { class: 'preview-body' }),
                mobileHeader: () => h('div', { class: 'preview-mobile-header' }, '移动管理栏'),
              },
            );
        },
      }),
    );
    app.provide(MOBILE_LAYOUT_CONTEXT, ref(isMobile));
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();
    return { visible };
  }

  it('移动布局下铺满视口并使用专属管理栏', async () => {
    mountModal(true);
    await nextTick();

    const mask = document.body.querySelector<HTMLElement>('.mask-container');
    const modal = document.body.querySelector<HTMLElement>('.modal-view');

    expect(mask?.classList.contains('is-mobile-fullscreen')).toBe(true);
    expect(modal?.classList.contains('is-mobile-fullscreen')).toBe(true);
    expect(modal?.style.width).toBe('');
    expect(modal?.style.height).toBe('');
    expect(document.body.querySelector('.preview-mobile-header')?.textContent).toBe('移动管理栏');
  });

  it('桌面布局继续使用原有尺寸和标题栏', async () => {
    mountModal(false);
    await nextTick();

    const modal = document.body.querySelector<HTMLElement>('.modal-view');

    expect(modal?.classList.contains('is-mobile-fullscreen')).toBe(false);
    expect(modal?.style.width).toBe('92vw');
    expect(modal?.style.height).toContain('100vh');
    expect(document.body.querySelector('.preview-mobile-header')).toBeNull();
    expect(document.body.querySelector('.modal-title')?.textContent).toContain('用户预览');
  });
});
