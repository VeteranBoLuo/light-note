import { describe, expect, it, vi } from 'vitest';
import { AI_ASSISTANT_OPEN_EVENT, normalizeAiAssistantLaunchPayload, openAiAssistant } from './aiEntry';

describe('aiEntry', () => {
  it('只保留受支持、数量受限的启动上下文', () => {
    const payload = normalizeAiAssistantLaunchPayload({
      suggestedIntent: 'compare',
      surface: 'search',
      query: '  agent  ',
      contextRefs: [
        { type: 'note', id: 1, title: 'A' },
        { type: 'unknown', id: 2, title: 'B' },
      ],
    });
    expect(payload).toMatchObject({
      suggestedIntent: 'compare',
      surface: 'search',
      query: 'agent',
      contextRefs: [{ type: 'note', id: '1', title: 'A' }],
    });
  });

  it('丢弃未知入口标识，避免把自由文本带入埋点', () => {
    expect(normalizeAiAssistantLaunchPayload({ surface: 'private note title' }).surface).toBeUndefined();
  });

  it.each(['bookmark_manage', 'cloud_space', 'tag_detail'] as const)('保留无正文的资源入口枚举 %s', (surface) => {
    expect(normalizeAiAssistantLaunchPayload({ surface }).surface).toBe(surface);
  });

  it('发送统一的类型化打开事件', () => {
    const listener = vi.fn();
    window.addEventListener(AI_ASSISTANT_OPEN_EVENT, listener);
    openAiAssistant({ suggestedIntent: 'summarize' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail.suggestedIntent).toBe('summarize');
    window.removeEventListener(AI_ASSISTANT_OPEN_EVENT, listener);
  });
});
