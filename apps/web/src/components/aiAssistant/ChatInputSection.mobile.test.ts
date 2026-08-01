import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';

vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: {
    name: 'BDrawer',
    props: {
      open: Boolean,
      title: String,
      placement: String,
      height: String,
      bodyPadding: String,
    },
    emits: ['close'],
    setup(
      props: { open: boolean; title?: string; placement?: string; height?: string },
      { emit, slots }: { emit: (name: 'close') => void; slots: Record<string, () => unknown> },
    ) {
      return () =>
        props.open
          ? h(
              'section',
              {
                class: 'mock-material-drawer',
                'data-title': props.title,
                'data-placement': props.placement,
                'data-height': props.height,
              },
              [h('button', { class: 'mock-drawer-close', onClick: () => emit('close') }), slots.default?.()],
            )
          : null;
    },
  },
}));

vi.mock('@/components/base/BasicComponents/BInput.vue', () => ({
  default: { name: 'BInput', setup: () => () => h('textarea', { class: 'mock-input' }) },
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
vi.mock('./AiContextPicker.vue', () => ({
  default: {
    name: 'AiContextPicker',
    props: { modelValue: Array },
    setup:
      (_: unknown, { slots }: { slots: Record<string, () => unknown> }) =>
      () =>
        h('div', { class: 'mock-context-picker' }, slots.trigger?.()),
  },
}));
vi.mock('./AiAttachmentPicker.vue', () => ({
  default: {
    name: 'AiAttachmentPicker',
    props: { modelValue: Array, prepareActionFn: Function },
    setup: (
      props: { modelValue?: unknown[] },
      {
        expose,
        slots,
      }: { expose: (value: Record<string, unknown>) => void; slots: Record<string, (props?: unknown) => unknown> },
    ) => {
      expose({
        attachCloudFile: vi.fn(),
        openAction: vi.fn(),
        uploadPastedImage: vi.fn(),
      });
      return () =>
        h(
          'div',
          { class: 'mock-attachment-picker' },
          props.modelValue?.length ? undefined : slots.trigger?.({ busy: false }),
        );
    },
  },
}));
vi.mock('./TranslationToggle.vue', () => ({
  default: { name: 'TranslationToggle', setup: () => () => null },
}));
vi.mock('@/components/resourcePicker/ResourcePickerPanel.vue', () => ({
  default: { name: 'ResourcePickerPanel', setup: () => () => null },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIcon', setup: () => () => h('span', { class: 'mock-icon' }) },
}));
vi.mock('@/composables/useDismissOnOutside', () => ({ useDismissOnOutside: vi.fn() }));
vi.mock('@/composables/useCurrentPageResource', async () => {
  const { ref } = await import('vue');
  return { useCurrentPageResource: () => ref(null) };
});

const { default: ChatInputSection } = await import('./ChatInputSection.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountInput(isMobile: boolean, withAttachment = false) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup: () => () =>
      h(ChatInputSection, {
        modelValue: '',
        isLoading: false,
        quota: null,
        showTranslation: false,
        enableTranslation: false,
        translationConfig: { source: 'auto', target: 'zh-CN' },
        isMobile,
        sendFn: vi.fn(),
        stopFn: vi.fn(),
        contexts: [{ type: 'note', id: 'note-1', title: '开发修复计划' }],
        attachments: withAttachment
          ? [
              {
                id: 'attachment-1',
                fileName: 'mobile-layout.png',
                fileSize: 1024,
                fileType: 'image/png',
                status: 'ready',
              },
            ]
          : [],
        prepareAttachmentActionFn: vi.fn(async () => undefined),
      }),
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          ai: {
            material: {
              mobileTitle: '添加与管理材料',
              mobileAdd: '添加材料',
              once: '仅本次',
              onceTooltip: '默认仅用于本次提问，发送后自动清除',
              attachmentOnceHint: '文件默认仅用于本次提问',
              contextDescription: '从书签、笔记、云文件或标签中选择',
              fileDescription: '图片、PDF、Word、文本，最大 20MB',
            },
            addContext: '添加资源',
            uploadFile: '上传文件',
            inputPlaceholder: '输入您的问题…',
            inputHint: 'Enter 发送',
            send: '发送',
            pause: '暂停',
          },
        },
      },
    }),
  );
  app.component('SvgIcon', { setup: () => () => h('span', { class: 'mock-icon' }) });
  app.directive('click-log', () => undefined);
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('ChatInputSection mobile material actions', () => {
  it('输入区只显示带数量徽标的单一入口，操作项放到底部抽屉', async () => {
    const host = mountInput(true);
    expect(host.querySelector('.mobile-context-panel')).toBeNull();
    expect(host.querySelector('.mock-material-drawer')).toBeNull();
    expect(host.querySelector('.mobile-material-summary')).toBeNull();
    expect(host.querySelector('.mobile-context-toggle__label')?.textContent).toContain('添加材料');
    expect(host.querySelector('.mobile-context-toggle__count')?.textContent).toContain('1');

    host.querySelector<HTMLButtonElement>('.mobile-context-toggle')?.click();
    await nextTick();

    const drawer = host.querySelector<HTMLElement>('.mock-material-drawer');
    expect(drawer?.dataset.title).toBe('添加与管理材料');
    expect(drawer?.dataset.placement).toBe('bottom');
    expect(drawer?.dataset.height).toBe('auto');
    expect(drawer?.querySelector('.mock-context-picker')).not.toBeNull();
    expect(drawer?.querySelector('.mock-attachment-picker')).not.toBeNull();
    expect(drawer?.querySelectorAll('.mobile-material-action-card')).toHaveLength(2);
    expect(drawer?.textContent).toContain('添加资源');
    expect(drawer?.textContent).toContain('上传文件');
    expect(drawer?.textContent).not.toContain('上传图片');

    drawer?.querySelector<HTMLButtonElement>('.mock-drawer-close')?.click();
    await nextTick();
    expect(host.querySelector('.mock-material-drawer')).toBeNull();
  });

  it('桌面端继续使用原有内联材料区，不挂载移动抽屉', () => {
    const host = mountInput(false);
    expect(host.querySelector('.context-actions')).not.toBeNull();
    expect(host.querySelector('.mobile-context-actions')).toBeNull();
    expect(host.querySelector('.mock-material-drawer')).toBeNull();
  });

  it('已有附件时显示合并数量徽标，并隐藏重复上传入口', async () => {
    const host = mountInput(true, true);
    expect(host.querySelector('.mobile-context-toggle__count')?.textContent).toContain('2');

    host.querySelector<HTMLButtonElement>('.mobile-context-toggle')?.click();
    await nextTick();

    const drawer = host.querySelector<HTMLElement>('.mock-material-drawer');
    expect(drawer?.querySelectorAll('.mobile-material-action-card')).toHaveLength(1);
  });
});
