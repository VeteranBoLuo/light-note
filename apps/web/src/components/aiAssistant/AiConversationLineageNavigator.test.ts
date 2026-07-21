import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const getAiConversationLineage = vi.fn();
vi.mock('@/api/aiWorkspaceApi', () => ({ getAiConversationLineage }));

const { default: AiConversationLineageNavigator } = await import('./AiConversationLineageNavigator.vue');
let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

describe('AiConversationLineageNavigator', () => {
  it('按服务端结构顺序展示分支并用相邻按钮导航', async () => {
    getAiConversationLineage.mockResolvedValue({
      rootConversationId: 'root-1',
      currentConversationId: 'root-1',
      truncated: false,
      nodes: [
        { id: 'root-1', title: '根对话', depth: 0, current: true, createdAt: '2026-07-19T10:00:00Z' },
        {
          id: 'child-1',
          title: '方案分支',
          depth: 1,
          current: false,
          parentConversationId: 'root-1',
          createdAt: '2026-07-19T10:01:00Z',
        },
      ],
    });
    const open = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup: () => () => h(AiConversationLineageNavigator, { conversationId: 'root-1', onOpen: open }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.component('OriginalIcon', { render: () => h('span') });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    await flush();

    expect(host.textContent).toContain('2 个对话分支');
    const next = host.querySelector<HTMLButtonElement>('button[aria-label="下一个分支"]');
    expect(next).toBeTruthy();
    next?.click();
    expect(open).toHaveBeenCalledWith('child-1');
    expect(getAiConversationLineage).toHaveBeenCalledWith('root-1');
  });
});
