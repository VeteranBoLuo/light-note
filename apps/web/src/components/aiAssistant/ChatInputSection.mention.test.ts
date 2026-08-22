import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';

const pickerMocks = vi.hoisted(() => ({
  chooseActive: vi.fn(),
  moveActive: vi.fn(),
}));

vi.mock('@/components/base/BasicComponents/BPopover.vue', () => ({
  default: {
    name: 'BPopover',
    setup:
      (_: unknown, { slots }: { slots: Record<string, () => unknown> }) =>
      () =>
        slots.default?.(),
  },
}));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: { name: 'BDrawer', setup: () => () => null },
}));
vi.mock('./AiContextPicker.vue', () => ({
  default: { name: 'AiContextPicker', setup: () => () => null },
}));
vi.mock('./AiAttachmentPicker.vue', async () => {
  const { h: render } = await import('vue');
  return {
    default: {
      name: 'AiAttachmentPicker',
      setup(_: unknown, { expose }: { expose: (value: Record<string, unknown>) => void }) {
        expose({
          attachCloudFile: vi.fn(),
          openAction: vi.fn(),
          uploadPastedImage: vi.fn(),
        });
        return () => render('div');
      },
    },
  };
});
vi.mock('./TranslationToggle.vue', () => ({
  default: { name: 'TranslationToggle', setup: () => () => null },
}));
vi.mock('@/components/resourcePicker/ResourcePickerPanel.vue', async () => {
  const { h: render, onMounted } = await import('vue');
  return {
    default: {
      name: 'ResourcePickerPanel',
      emits: ['select', 'close', 'results-count'],
      setup(
        _: unknown,
        {
          emit,
          expose,
        }: {
          emit: (event: string, value?: unknown) => void;
          expose: (value: Record<string, unknown>) => void;
        },
      ) {
        const chooseActive = () => {
          pickerMocks.chooseActive();
          emit('select', { type: 'bookmark', id: 'bookmark-1', title: '宝塔面板' });
        };
        expose({ chooseActive, moveActive: pickerMocks.moveActive });
        onMounted(() => emit('results-count', 1));
        return () => render('div', { class: 'mock-resource-picker' });
      },
    },
  };
});
vi.mock('@/composables/useDismissOnOutside', () => ({ useDismissOnOutside: vi.fn() }));
vi.mock('@/composables/useCurrentPageResource', async () => {
  const { ref: valueRef } = await import('vue');
  return { useCurrentPageResource: () => valueRef(null) };
});
vi.mock('@/utils/textareaCaret', () => ({
  getTextareaCaretRect: vi.fn(() => ({ left: 0, top: 0, height: 20 })),
  toAnchorOffset: vi.fn(() => ({ left: 0, top: 0 })),
}));

const { default: ChatInputSection } = await import('./ChatInputSection.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.clearAllMocks();
  vi.useRealTimers();
});

function mountComposer(initialValue = '') {
  const host = document.createElement('div');
  document.body.append(host);
  const input = ref(initialValue);
  const contexts = ref<Array<{ type: 'bookmark'; id: string; title: string }>>([]);
  const sendFn = vi.fn();
  const stopFn = vi.fn();
  const app = createApp({
    setup: () => () =>
      h(ChatInputSection, {
        modelValue: input.value,
        'onUpdate:modelValue': (value: string) => {
          input.value = value;
        },
        isLoading: false,
        quota: null,
        showTranslation: false,
        enableTranslation: false,
        translationConfig: { source: 'auto', target: 'zh-CN' },
        isMobile: false,
        sendFn,
        stopFn,
        contexts: contexts.value,
        'onUpdate:contexts': (value: typeof contexts.value) => {
          contexts.value = value;
        },
        attachments: [],
        prepareAttachmentActionFn: vi.fn(async () => undefined),
      }),
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          placeholder: { input: '请输入' },
          ai: {
            capabilityScope: { label: '限定本轮模块' },
            inputPlaceholder: '输入您的问题…',
            inputHint: 'Enter 发送',
            send: '发送',
            pause: '暂停',
          },
          common: { noMatch: '无匹配项' },
        },
      },
    }),
  );
  app.component('SvgIcon', { setup: () => () => h('span') });
  app.directive('click-log', () => undefined);
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, input, contexts, sendFn, stopFn };
}

describe('ChatInputSection @ 资源键盘选择', () => {
  it('资源列表打开时 Enter 选择高亮资源且不发送消息', async () => {
    const { host, input, contexts, sendFn, stopFn } = mountComposer();
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!;

    textarea.value = '@';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    textarea.setSelectionRange(1, 1);
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: '@', bubbles: true, cancelable: true }));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    await nextTick();
    await nextTick();

    expect(host.querySelector('.mock-resource-picker')).not.toBeNull();
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    textarea.dispatchEvent(enterEvent);
    await nextTick();

    expect(enterEvent.defaultPrevented).toBe(true);
    expect(pickerMocks.chooseActive).toHaveBeenCalledOnce();
    expect(contexts.value).toEqual([{ type: 'bookmark', id: 'bookmark-1', title: '宝塔面板' }]);
    expect(input.value).toBe('');
    expect(stopFn).not.toHaveBeenCalled();
    expect(sendFn).not.toHaveBeenCalled();
  });

  it('资源列表未打开时 Enter 仍按原逻辑发送', async () => {
    const { host, sendFn, stopFn } = mountComposer('普通问题');
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!;

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await nextTick();

    expect(stopFn).toHaveBeenCalledOnce();
    expect(sendFn).toHaveBeenCalledOnce();
    expect(pickerMocks.chooseActive).not.toHaveBeenCalled();
  });
});
