import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import type { AiCapabilityModule } from '@/types/aiCapabilityScope';
import type { AiCapabilityPolicyProfile } from '@/types/aiCapabilityPolicy';

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
vi.mock('./AiMaterialHub.vue', () => ({
  default: {
    name: 'AiMaterialHub',
    props: {
      modelValue: { type: Array, default: () => [] },
      scopeModelValue: { type: Array, default: () => [] },
      attachments: { type: Array, default: () => [] },
      isMobile: Boolean,
    },
    emits: ['clear'],
    setup(
      props: { modelValue: unknown[]; scopeModelValue: unknown[]; attachments: unknown[]; isMobile: boolean },
      { emit, expose }: { emit: (event: 'clear') => void; expose: (value: Record<string, unknown>) => void },
    ) {
      expose({
        attachCloudFile: vi.fn(async () => undefined),
        openAction: vi.fn(() => false),
        uploadPastedImage: vi.fn(async () => false),
      });
      return () =>
        h(
          'section',
          {
            class: 'mock-material-hub',
            'data-mobile': String(props.isMobile),
            'data-count': String(props.modelValue.length + props.scopeModelValue.length + props.attachments.length),
          },
          [h('button', { class: 'mock-clear-materials', onClick: () => emit('clear') }, 'clear')],
        );
    },
  },
}));
vi.mock('./AiConversationSettings.vue', () => ({
  default: {
    name: 'AiConversationSettings',
    props: { capabilityModule: String, capabilityPolicyProfile: String },
    setup: (props: { capabilityModule?: string; capabilityPolicyProfile?: string }) => () =>
      h('button', {
        class: 'mock-conversation-settings',
        'aria-label': '对话设置',
        'data-custom': String(props.capabilityModule !== 'auto' || props.capabilityPolicyProfile !== 'auto'),
      }),
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
  const { ref: valueRef } = await import('vue');
  return { useCurrentPageResource: () => valueRef(null) };
});

const { default: ChatInputSection } = await import('./ChatInputSection.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountInput(options: {
  isMobile?: boolean;
  withAttachment?: boolean;
  capabilityPolicyProfile?: AiCapabilityPolicyProfile;
  capabilityModule?: AiCapabilityModule;
} = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const capabilityPolicyProfile = ref<AiCapabilityPolicyProfile>(options.capabilityPolicyProfile || 'auto');
  const capabilityModule = ref<AiCapabilityModule>(options.capabilityModule || 'auto');
  const clearMaterials = vi.fn();
  const app = createApp({
    setup: () => () =>
      h(ChatInputSection, {
        modelValue: '',
        isLoading: false,
        quota: null,
        showTranslation: false,
        enableTranslation: false,
        translationConfig: { source: 'auto', target: 'zh-CN' },
        isMobile: Boolean(options.isMobile),
        capabilityModule: capabilityModule.value,
        capabilityModuleOptions: [
          { value: 'auto', label: '自动判断' },
          { value: 'note', label: '仅笔记' },
        ],
        capabilityPolicyProfile: capabilityPolicyProfile.value,
        capabilityPolicyOptions: [
          { value: 'auto', label: '自动使用（推荐）' },
          { value: 'chat_only', label: '不使用轻笺内容' },
          { value: 'read_only', label: '只查询，不修改' },
        ],
        'onUpdate:capabilityModule': (value: AiCapabilityModule) => {
          capabilityModule.value = value;
        },
        'onUpdate:capabilityPolicyProfile': (value: AiCapabilityPolicyProfile) => {
          capabilityPolicyProfile.value = value;
        },
        onClearMaterials: clearMaterials,
        sendFn: vi.fn(),
        stopFn: vi.fn(),
        contexts: [{ type: 'note', id: 'note-1', title: '开发修复计划' }],
        attachments: options.withAttachment
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
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.component('SvgIcon', { setup: () => () => h('span', { class: 'mock-icon' }) });
  app.directive('click-log', () => undefined);
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, capabilityPolicyProfile, capabilityModule, clearMaterials };
}

describe('ChatInputSection compact composer controls', () => {
  it('默认自动状态不占主界面，只保留材料入口和图标化对话设置', () => {
    const { host } = mountInput();

    expect(host.querySelector('.capability-status-list')).toBeNull();
    expect(host.querySelector('.mock-material-hub')?.getAttribute('data-count')).toBe('1');
    expect(host.querySelector('.mock-conversation-settings')?.getAttribute('aria-label')).toBe('对话设置');
    expect(host.textContent).not.toContain('自动使用（推荐）');
  });

  it('桌面和移动端复用同一材料控制器，并正确合并材料数量', () => {
    const mobile = mountInput({ isMobile: true, withAttachment: true });
    expect(mobile.host.querySelector('.mock-material-hub')?.getAttribute('data-mobile')).toBe('true');
    expect(mobile.host.querySelector('.mock-material-hub')?.getAttribute('data-count')).toBe('2');

    cleanup?.();
    cleanup = undefined;
    const desktop = mountInput({ isMobile: false, withAttachment: true });
    expect(desktop.host.querySelector('.mock-material-hub')?.getAttribute('data-mobile')).toBe('false');
    expect(desktop.host.querySelector('.mock-material-hub')?.getAttribute('data-count')).toBe('2');
  });

  it('非默认设置以可撤销状态展示，恢复后不再占用输入区', async () => {
    const { host, capabilityPolicyProfile, capabilityModule } = mountInput({
      capabilityPolicyProfile: 'read_only',
      capabilityModule: 'note',
    });

    const pills = host.querySelectorAll<HTMLButtonElement>('.capability-status-pill');
    expect(pills).toHaveLength(2);
    expect(host.textContent).toContain('只查询，不修改');
    expect(host.textContent).toContain('仅笔记');

    pills[0].click();
    await nextTick();
    expect(capabilityPolicyProfile.value).toBe('auto');
    expect(host.querySelectorAll('.capability-status-pill')).toHaveLength(1);

    host.querySelector<HTMLButtonElement>('.capability-status-pill')?.click();
    await nextTick();
    expect(capabilityModule.value).toBe('auto');
    expect(host.querySelector('.capability-status-list')).toBeNull();
  });

  it('不使用轻笺内容时隐藏材料和失效的单轮范围，恢复自动后材料入口重新出现', async () => {
    const { host, capabilityPolicyProfile } = mountInput({
      capabilityPolicyProfile: 'chat_only',
      capabilityModule: 'note',
    });

    expect(host.querySelector('.mock-material-hub')).toBeNull();
    expect(host.textContent).toContain('不使用轻笺内容');
    expect(host.textContent).not.toContain('已限定');
    expect(host.querySelectorAll('.capability-status-pill')).toHaveLength(1);

    host.querySelector<HTMLButtonElement>('.capability-status-pill')?.click();
    await nextTick();
    expect(capabilityPolicyProfile.value).toBe('auto');
    expect(host.querySelector('.mock-material-hub')).not.toBeNull();
  });

  it('统一材料入口只向父级发出一次清空语义', () => {
    const { host, clearMaterials } = mountInput({ withAttachment: true });

    host.querySelector<HTMLButtonElement>('.mock-clear-materials')?.click();
    expect(clearMaterials).toHaveBeenCalledOnce();
  });
});
