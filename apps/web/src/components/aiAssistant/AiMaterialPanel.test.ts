import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

vi.mock('./AiContextPicker.vue', () => ({
  default: {
    name: 'AiContextPicker',
    setup: () => () => h('div', { class: 'mock-context-picker' }),
  },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIcon', setup: () => () => h('span', { class: 'mock-icon' }) },
}));

const { default: AiMaterialPanel } = await import('./AiMaterialPanel.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountPanel(options: {
  materialCount: number;
  hasAttachment?: boolean;
  attachmentBusy?: boolean;
  showTitle?: boolean;
}) {
  const host = document.createElement('div');
  document.body.append(host);
  const clear = vi.fn();
  const upload = vi.fn();
  const app = createApp({
    setup: () => () =>
      h(AiMaterialPanel, {
        modelValue: [],
        scopeModelValue: [],
        materialCount: options.materialCount,
        hasAttachment: Boolean(options.hasAttachment),
        attachmentBusy: Boolean(options.attachmentBusy),
        showTitle: options.showTitle,
        onClear: clear,
        onUpload: upload,
      }),
  });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, clear, upload };
}

describe('AiMaterialPanel', () => {
  it('只有一项材料时不显示全局清空，避免与单项移除重复', () => {
    const { host } = mountPanel({ materialCount: 1 });

    expect(host.querySelector('.ai-material-panel__clear')).toBeNull();
    expect(host.querySelector('.mock-context-picker')).not.toBeNull();
  });

  it('两项及以上材料才显示清空全部，并只发出统一 clear 事件', () => {
    const { host, clear } = mountPanel({ materialCount: 2 });

    host.querySelector<HTMLButtonElement>('.ai-material-panel__clear')?.click();
    expect(clear).toHaveBeenCalledOnce();
  });

  it('已有附件时禁用重复上传，空闲时允许从同一入口上传', () => {
    const occupied = mountPanel({ materialCount: 1, hasAttachment: true });
    expect(occupied.host.querySelector<HTMLButtonElement>('.ai-material-panel__upload')?.disabled).toBe(true);

    cleanup?.();
    cleanup = undefined;
    const empty = mountPanel({ materialCount: 0 });
    const uploadButton = empty.host.querySelector<HTMLButtonElement>('.ai-material-panel__upload');
    expect(uploadButton?.disabled).toBe(false);
    uploadButton?.click();
    expect(empty.upload).toHaveBeenCalledOnce();
  });

  it('移动抽屉可隐藏面板内重复标题，但保留说明和清空入口', () => {
    const { host } = mountPanel({ materialCount: 2, showTitle: false });

    expect(host.querySelector('.ai-material-panel__header strong')).toBeNull();
    expect(host.textContent).toContain('材料默认只用于下一次提问');
    expect(host.querySelector('.ai-material-panel__clear')).not.toBeNull();
  });
});
