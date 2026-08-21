import { describe, expect, it } from 'vitest';
import {
  budgetAgentRecentDialogue,
  resolveServerAuthoritativeRecentDialogue,
  selectAgentConversationHistory,
  selectServerAuthoritativeRecentDialogue,
} from './conversationHistory.js';

describe('Agent 会话历史边界', () => {
  it('V3 强制模式不向 Planner/Tool 暴露原始历史正文', () => {
    expect(
      selectAgentConversationHistory({
        runtimeMode: 'v3_enforce',
        clientHistory: [{ role: 'user', content: '旧的最近 7 天范围' }],
        sessionTurns: [{ user: '旧问题', assistant: '旧回答' }],
      }),
    ).toEqual([]);
  });

  it('recentDialogue 只选择服务端云消息，并折叠同一回答的重新生成版本', () => {
    expect(
      selectServerAuthoritativeRecentDialogue({
        cloudMessages: [
          { role: 'user', content: '解释知识库检索' },
          { role: 'assistant', content: '旧版本', versionGroupId: 'answer-1', status: 'completed' },
          { role: 'assistant', content: '新版本', versionGroupId: 'answer-1', status: 'completed' },
          { role: 'assistant', content: '生成中内容', status: 'generating' },
        ],
        sessionTurns: [{ user: '客户端无法伪造这里', assistant: '服务端 session 回答' }],
      }),
    ).toEqual([
      { role: 'user', content: '解释知识库检索' },
      { role: 'assistant', content: '新版本' },
    ]);
    expect(
      resolveServerAuthoritativeRecentDialogue({
        cloudMessages: [{ role: 'assistant', content: '', status: 'completed' }],
        sessionTurns: [{ user: '临时追问', assistant: '临时回答' }],
      }),
    ).toEqual({
      source: 'session',
      messages: [
        { role: 'user', content: '临时追问' },
        { role: 'assistant', content: '临时回答' },
      ],
    });
  });

  it('云消息不可用时回退服务端 session，并按阶段统一限制轮数和字符', () => {
    const dialogue = selectServerAuthoritativeRecentDialogue({
      sessionTurns: Array.from({ length: 12 }, (_, index) => ({
        user: `问题${index}-${'问'.repeat(300)}`,
        assistant: `回答${index}-${'答'.repeat(300)}`,
      })),
    });
    const compiler = budgetAgentRecentDialogue(dialogue, 'compiler');
    const dialogueComposer = budgetAgentRecentDialogue(dialogue, 'dialogueComposer');
    const groundedComposer = budgetAgentRecentDialogue(dialogue, 'groundedComposer');

    expect(compiler.length).toBeLessThanOrEqual(8);
    expect(compiler.reduce((sum, item) => sum + item.content.length, 0)).toBeLessThanOrEqual(1_600);
    expect(dialogueComposer.length).toBeLessThanOrEqual(20);
    expect(dialogueComposer.reduce((sum, item) => sum + item.content.length, 0)).toBeLessThanOrEqual(8_000);
    expect(groundedComposer.length).toBeLessThanOrEqual(8);
    expect(groundedComposer.reduce((sum, item) => sum + item.content.length, 0)).toBeLessThanOrEqual(2_400);
    expect(compiler.at(-1)?.content).toContain('回答11');
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
