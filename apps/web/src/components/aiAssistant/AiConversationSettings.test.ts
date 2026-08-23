import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import type { AiCapabilityModule } from '@/types/aiCapabilityScope';
import type { AiCapabilityPolicyProfile } from '@/types/aiCapabilityPolicy';

vi.mock('@/components/base/BasicComponents/BPopover.vue', () => ({
  default: {
    name: 'BPopover',
    setup:
      (_: unknown, { slots }: { slots: Record<string, () => unknown> }) =>
      () =>
        h('div', { class: 'mock-popover' }, [slots.default?.(), slots.content?.()]),
  },
}));
vi.mock('@/components/base/BasicComponents/BSelect.vue', () => ({
  default: {
    name: 'BSelect',
    props: { value: String, options: { type: Array, default: () => [] }, disabled: Boolean },
    emits: ['update:value'],
    setup(
      props: { value?: string; options: Array<{ value: string; label: string }>; disabled?: boolean },
      { emit }: { emit: (event: 'update:value', value: string) => void },
    ) {
      return () =>
        h(
          'div',
          { class: 'mock-select', 'data-value': props.value, 'data-disabled': String(Boolean(props.disabled)) },
          props.options.map((option) =>
            h(
              'button',
              {
                type: 'button',
                'data-select-value': option.value,
                disabled: props.disabled,
                onClick: () => emit('update:value', option.value),
              },
              option.label,
            ),
          ),
        );
    },
  },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIcon', setup: () => () => h('span', { class: 'mock-icon' }) },
}));

const { default: AiConversationSettings } = await import('./AiConversationSettings.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountSettings(
  initialPolicy: AiCapabilityPolicyProfile = 'auto',
  initialModule: AiCapabilityModule = 'auto',
) {
  const host = document.createElement('div');
  document.body.append(host);
  const policy = ref<AiCapabilityPolicyProfile>(initialPolicy);
  const module = ref<AiCapabilityModule>(initialModule);
  const app = createApp({
    setup: () => () =>
      h(AiConversationSettings, {
        capabilityPolicyProfile: policy.value,
        capabilityPolicyOptions: [
          { value: 'auto', label: '自动使用（推荐）' },
          { value: 'chat_only', label: '不使用轻笺内容' },
          { value: 'read_only', label: '只查询，不修改' },
        ],
        capabilityModule: module.value,
        capabilityModuleOptions: [
          { value: 'auto', label: '自动判断' },
          { value: 'note', label: '仅笔记' },
        ],
        'onUpdate:capabilityPolicyProfile': (value: AiCapabilityPolicyProfile) => {
          policy.value = value;
        },
        'onUpdate:capabilityModule': (value: AiCapabilityModule) => {
          module.value = value;
        },
      }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, policy, module };
}

describe('AiConversationSettings', () => {
  it('默认状态只显示无文字的设置图标，高级范围保持折叠', () => {
    const { host } = mountSettings();
    const trigger = host.querySelector<HTMLElement>('.ai-conversation-settings__trigger');

    expect(trigger?.textContent?.trim()).toBe('');
    expect(trigger?.getAttribute('aria-label')).toBe('对话设置');
    expect(host.querySelector('.ai-conversation-settings__indicator')).toBeNull();
    expect(host.querySelector('.ai-conversation-settings__field.is-advanced')).toBeNull();
  });

  it('高级区域按需展开，并能更新一次性查询范围', async () => {
    const { host, module } = mountSettings();

    host.querySelector<HTMLButtonElement>('.ai-conversation-settings__advanced-trigger')?.click();
    await nextTick();
    expect(host.querySelector('.ai-conversation-settings__field.is-advanced')).not.toBeNull();

    host.querySelector<HTMLButtonElement>('[data-select-value="note"]')?.click();
    await nextTick();
    expect(module.value).toBe('note');
    expect(host.querySelector('.ai-conversation-settings__indicator')).not.toBeNull();
  });

  it('不使用轻笺内容时展示明确边界，并隐藏已经失效的一次性模块限制', async () => {
    const { host, policy } = mountSettings('read_only', 'note');
    expect(host.querySelector('.ai-conversation-settings__indicator')).not.toBeNull();

    host.querySelector<HTMLButtonElement>('[data-select-value="chat_only"]')?.click();
    await nextTick();

    expect(policy.value).toBe('chat_only');
    expect(host.querySelector('.ai-conversation-settings__boundary')?.textContent).toContain('不会读取');
    expect(host.querySelector('.ai-conversation-settings__advanced-trigger')).toBeNull();
    expect(host.querySelector('.ai-conversation-settings__field.is-advanced')).toBeNull();
  });
});
