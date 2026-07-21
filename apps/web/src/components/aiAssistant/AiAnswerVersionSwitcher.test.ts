import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const listAiMessageVersions = vi.fn();
vi.mock('@/api/aiWorkspaceApi', () => ({ listAiMessageVersions }));

const { default: AiAnswerVersionSwitcher } = await import('./AiAnswerVersionSwitcher.vue');
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

describe('AiAnswerVersionSwitcher', () => {
  it('展示同组位置并通过 BButton 聚焦相邻旧答案，不删除任何历史', async () => {
    listAiMessageVersions.mockResolvedValue({
      conversationId: 'conversation-1',
      currentMessageId: 'answer-2',
      versionGroupId: 'answer-1',
      items: [
        { messageId: 'answer-1', versionGroupId: 'answer-1' },
        { messageId: 'answer-2', versionGroupId: 'answer-1' },
        { messageId: 'answer-3', versionGroupId: 'answer-1' },
      ],
      truncated: false,
    });
    const navigate = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      setup: () => () =>
        h(AiAnswerVersionSwitcher, {
          conversationId: 'conversation-1',
          messageId: 'answer-2',
          versionGroupId: 'answer-1',
          onNavigate: navigate,
        }),
    });
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
    app.component('OriginalIcon', { render: () => h('span') });
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };
    await flush();

    expect(host.textContent).toContain('版本 2 / 3');
    const buttons = host.querySelectorAll<HTMLButtonElement>('button');
    buttons[0].click();
    buttons[1].click();
    expect(navigate.mock.calls).toEqual([['answer-1'], ['answer-3']]);
    expect(listAiMessageVersions).toHaveBeenCalledWith('conversation-1', 'answer-2');
  });
});
