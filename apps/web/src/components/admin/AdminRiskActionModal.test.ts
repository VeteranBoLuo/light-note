import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import AdminRiskActionModal from './AdminRiskActionModal.vue';

const messages = {
  'zh-CN': {
    common: {
      cancel: '取消',
      close: '关闭',
      confirm: '确认',
      defaultTitle: '提示',
    },
    adminRiskAction: {
      reasonLabel: '操作原因',
      reasonRule: '至少 6 个字',
      reasonPlaceholder: '请说明本次操作的业务原因',
      confirmPhraseLabel: '二次确认',
      confirmPhraseRule: '请输入“{phrase}”',
      auditHint: '提交后会记录审计回执。',
      defaultConfirm: '确认执行',
    },
  },
};

let cleanup: (() => void) | undefined;

function mountModal(defaultReason = '', loading = false) {
  const host = document.createElement('div');
  document.body.append(host);
  const visible = ref(true);
  const confirmed = vi.fn();
  const app = createApp({
    setup() {
      return () =>
        h(AdminRiskActionModal, {
          visible: visible.value,
          'onUpdate:visible': (nextVisible: boolean) => {
            visible.value = nextVisible;
          },
          title: '确认安全事件结论',
          impact: '将事件标记为误报并回滚风险影响。',
          confirmLabel: '标记误报',
          defaultReason,
          loading,
          onConfirm: confirmed,
        });
    },
  });
  app.component('OriginalIcon', { render: () => h('span') });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
    document.body.innerHTML = '';
  };
  return { confirmed };
}

function findConfirmButton() {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.trim() === '标记误报',
  );
}

describe('AdminRiskActionModal 默认操作原因', () => {
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('每次打开时预填可编辑的六字原因，并允许直接确认', async () => {
    const { confirmed } = mountModal('确认属于误报');
    await nextTick();

    const textarea = document.body.querySelector<HTMLTextAreaElement>('textarea')!;
    expect([...textarea.value]).toHaveLength(6);
    expect(textarea.value).toBe('确认属于误报');
    expect(findConfirmButton()?.disabled).toBe(false);

    findConfirmButton()!.click();
    expect(confirmed).toHaveBeenCalledWith({ reason: '确认属于误报', confirmed: true, confirmText: '' });

    textarea.value = '';
    textarea.dispatchEvent(new Event('input'));
    await nextTick();
    expect(findConfirmButton()?.disabled).toBe(true);
  });

  it('未提供业务默认原因时保持空白和禁用确认状态', async () => {
    mountModal();
    await nextTick();

    expect(document.body.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('');
    expect(findConfirmButton()?.disabled).toBe(true);
  });

  it('提交加载中锁定输入、操作按钮与标题栏关闭入口', async () => {
    mountModal('确认属于误报', true);
    await nextTick();

    expect(document.body.querySelector<HTMLTextAreaElement>('textarea')?.disabled).toBe(true);
    expect(findConfirmButton()?.disabled).toBe(true);
    expect(document.body.querySelector<HTMLButtonElement>('.modal-close')?.disabled).toBe(true);
  });
});
