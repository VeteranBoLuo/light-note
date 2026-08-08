import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import BModal from './BModal.vue';

describe('BModal 初始焦点', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
  });

  it('打开时优先聚焦 initialFocus 指定的表单控件', async () => {
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
                title: '重命名',
                initialFocus: '#rename-target',
              },
              { default: () => h('input', { id: 'rename-target' }) },
            );
        },
      }),
    );
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();

    await nextTick();
    await nextTick();

    expect(document.activeElement?.id).toBe('rename-target');
  });
});
