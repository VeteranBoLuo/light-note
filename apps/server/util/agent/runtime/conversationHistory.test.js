import { describe, expect, it } from 'vitest';
import { selectAgentConversationHistory } from './conversationHistory.js';

describe('Agent 会话历史边界', () => {
  it('V3 强制模式不向任何模型阶段暴露原始历史正文', () => {
    expect(
      selectAgentConversationHistory({
        runtimeMode: 'v3_enforce',
        clientHistory: [{ role: 'user', content: '旧的最近 7 天范围' }],
        sessionTurns: [{ user: '旧问题', assistant: '旧回答' }],
      }),
    ).toEqual([]);
  });

  it('legacy 兼容最近消息与字符预算', () => {
    expect(
      selectAgentConversationHistory({
        runtimeMode: 'legacy',
        clientHistory: [
          { role: 'user', content: '很早的内容' },
          { role: 'assistant', content: '最近回答' },
        ],
        charBudget: 4,
      }),
    ).toEqual([{ role: 'assistant', content: '最近回答' }]);
  });
});
