import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import BModal from './BModal.vue';

describe('BModal 初始焦点', () => {
  let cleanup: (() => void) | null = null;

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    document.body.innerHTML = '';
    vi.useRealTimers();
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

  it('危险异步操作期间可禁用标题栏和遮罩关闭', async () => {
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
                title: '删除中',
                closeDisabled: true,
                maskClosable: true,
              },
              { default: () => h('div', '正在处理') },
            );
        },
      }),
    );
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => app.unmount();
    await nextTick();

    const closeButton = document.body.querySelector<HTMLButtonElement>('.modal-close');
    const mask = document.body.querySelector<HTMLElement>('.mask-container');
    expect(closeButton?.disabled).toBe(true);
    closeButton?.click();
    mask?.click();
    expect(visible.value).toBe(true);
  });

  it('在弹框内容内按 Escape 只关闭当前层，不把事件传播给背景层', async () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const visible = ref(true);
    const onDocumentKeydown = vi.fn();
    document.addEventListener('keydown', onDocumentKeydown);
    const app = createApp(
      defineComponent({
        setup() {
          return () =>
            h(
              BModal,
              {
                visible: visible.value,
                'onUpdate:visible': (value: boolean) => (visible.value = value),
                title: '添加资源',
              },
              { default: () => h('button', { class: 'modal-action' }, '资源一') },
            );
        },
      }),
    );
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.mount(host);
    cleanup = () => {
      document.removeEventListener('keydown', onDocumentKeydown);
      app.unmount();
    };
    await nextTick();
    await nextTick();

    const action = document.body.querySelector<HTMLButtonElement>('.modal-action');
    expect(action).not.toBeNull();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    action?.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(true);
    expect(onDocumentKeydown).not.toHaveBeenCalled();
    expect(visible.value).toBe(true);

    vi.advanceTimersByTime(200);
    await nextTick();
    expect(visible.value).toBe(false);
  });
});
