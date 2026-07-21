import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';

vi.mock('@/store', () => ({
  bookmarkStore: () => ({}),
  useUserStore: () => ({ headPicture: '' }),
}));
vi.mock('@/router', () => ({ default: { push: vi.fn() } }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: vi.fn(), warning: vi.fn() },
}));

const { default: ChatMessageItem } = await import('./ChatMessageItem.vue');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.innerHTML = '';
});

function mountMessage(
  locale: 'zh-CN' | 'en-US',
  activity: Array<Record<string, unknown> | string>,
  onOpenMemoryLedger = vi.fn(),
) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () =>
        h(ChatMessageItem, {
          message: {
            id: 'assistant-1',
            role: 'assistant',
            content: '已完成回答。',
            timestamp: new Date('2026-07-19T00:00:00.000Z'),
            activity,
          },
          onOpenMemoryLedger,
        });
    },
  });
  app.use(
    createI18n({
      legacy: false,
      locale,
      fallbackLocale: 'zh-CN',
      messages: { 'zh-CN': zhCN, 'en-US': enUS },
    }),
  );
  app.component('OriginalIcon', { render: () => h('span', { 'data-test-icon': '' }) });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, onOpenMemoryLedger };
}

// 记忆卡(memory-influence)已按产品决策从 ChatMessageItem 下线,本套测试暂跳过(见 docs/fix 交接记录)。
// 文件保留供 Codex 决定彻底移除记忆功能或恢复。
describe.skip('ChatMessageItem memory influence', () => {
  it('展示本轮使用数量、类型和范围，并可从 BButton 打开记忆账本', () => {
    const { host, onOpenMemoryLedger } = mountMessage('zh-CN', [
      {
        event: 'memory_context',
        status: 'used',
        count: 2,
        types: ['preference', 'workflow'],
        scopes: ['global', 'conversation'],
      },
    ]);
    const button = host.querySelector<HTMLButtonElement>('button.memory-influence');
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain('本轮使用了 2 条已确认记忆');
    expect(button?.textContent).toContain('回答偏好、工作流偏好');
    expect(button?.textContent).toContain('全局、当前会话');
    expect(button?.getAttribute('aria-label')).toContain('查看账本');
    button?.click();
    expect(onOpenMemoryLedger).toHaveBeenCalledOnce();
  });

  it('临时会话明确显示未使用，英文历史恢复同样可读', () => {
    const { host } = mountMessage('en-US', [
      {
        event: 'memory_context',
        status: 'not_used',
        count: 0,
        types: [],
        scopes: [],
        reason: 'temporary_session',
      },
    ]);
    expect(host.textContent).toContain('No confirmed memory used in this response');
    expect(host.textContent).toContain('Temporary sessions do not read long-term memory');
    expect(host.textContent).toContain('Open ledger');
  });

  it('旧历史没有记忆影响元数据时不伪造使用说明', () => {
    const { host } = mountMessage('zh-CN', [{ event: 'stage.changed', stage: 'completed' }]);
    expect(host.querySelector('.memory-influence')).toBeNull();
  });
});
