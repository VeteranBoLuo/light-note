import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/base/BasicComponents/BButton.vue', () => ({
  default: {
    props: ['disabled', 'loading'],
    template: '<button type="button" :disabled="disabled"><slot /></button>',
  },
}));
const { default: ChatRecalledMessageLine } = await import('./ChatRecalledMessageLine.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountLine(props: Record<string, unknown> = {}) {
  const emitted = { reedit: 0, viewOriginal: 0 };
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ChatRecalledMessageLine, {
    label: '“薄荷”撤回了一条消息',
    ...props,
    onViewOriginal: () => {
      emitted.viewOriginal += 1;
    },
    onReedit: () => {
      emitted.reedit += 1;
    },
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, emitted };
}

describe('ChatRecalledMessageLine', () => {
  it('默认只显示紧凑系统文案，不重新引入头像、身份元信息或气泡', () => {
    const { host } = mountLine();
    expect(host.textContent).toContain('“薄荷”撤回了一条消息');
    expect(host.querySelector('.community-message__avatar')).toBeNull();
    expect(host.querySelector('.community-message__meta')).toBeNull();
    expect(host.querySelector('.community-message__surface')).toBeNull();
    expect(host.querySelector('time')).toBeNull();
  });

  it('Root 审核入口触发查看原文事件', async () => {
    const { host, emitted } = mountLine({ canViewOriginal: true });
    const buttons = host.querySelectorAll<HTMLButtonElement>('button');
    expect(buttons[0]?.textContent).toContain('communityChat.recall.viewOriginal');
    buttons[0]?.click();
    await nextTick();
    expect(emitted.viewOriginal).toBe(1);
  });

  it('重新编辑只在允许时显示并触发回填事件', async () => {
    const { host, emitted } = mountLine({ canReedit: true });
    const button = host.querySelector<HTMLButtonElement>('.community-message__recall-reedit');

    expect(button?.textContent).toContain('communityChat.recall.reedit');
    button?.click();
    await nextTick();

    expect(emitted.reedit).toBe(1);
  });
});
