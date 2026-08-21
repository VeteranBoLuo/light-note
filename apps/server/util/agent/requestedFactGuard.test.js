import { describe, expect, it } from 'vitest';
import { ensureRequestedToolFacts } from './requestedFactGuard.js';

const queryTool = (summary, status = 'success') => ({ name: 'query_todos', status, summary });

describe('ensureRequestedToolFacts', () => {
  it('用户明确询问清单进度且模型漏答时，从安全摘要补回确定性进度', () => {
    const result = ensureRequestedToolFacts({
      question: '查询标题包含“推广”的待办，并告诉我清单进度。',
      answer: '找到了 1 条符合条件的未完成待办。',
      usedTools: [
        queryTool(
          '共 1 条待办：\n1. [todo:internal-id] 推广计划 · 待处理 · 普通优先级 · 清单：3/4 · 提醒时间：2026-08-20 16:00',
        ),
      ],
    });

    expect(result).toEqual({
      answer: '找到了 1 条符合条件的未完成待办。\n\n清单进度：3/4（已完成 3 项，剩余 1 项）。',
      applied: true,
      facts: ['3/4'],
    });
    expect(result.answer).not.toContain('internal-id');
  });

  it('回答已经包含等价进度时不重复追加', () => {
    const answer = '这条待办已完成 3 项，还差 1 项。';
    const result = ensureRequestedToolFacts({
      question: '告诉我这条待办的清单进度',
      answer,
      usedTools: [queryTool('1. [todo:id] 推广计划 · 清单：3/4')],
    });

    expect(result).toEqual({ answer, applied: false, facts: [] });
  });

  it('没有明确询问清单进度、工具失败或摘要数据非法时不改回答', () => {
    const answer = '找到了相关待办。';
    expect(
      ensureRequestedToolFacts({
        question: '查询推广待办',
        answer,
        usedTools: [queryTool('1. [todo:id] 推广计划 · 清单：3/4')],
      }),
    ).toEqual({ answer, applied: false, facts: [] });
    expect(
      ensureRequestedToolFacts({
        question: '清单进度是多少？',
        answer,
        usedTools: [queryTool('查询失败 · 清单：3/4', 'error'), queryTool('清单：5/4')],
      }),
    ).toEqual({ answer, applied: false, facts: [] });
  });

  it('多条不同进度按工具结果顺序补充并去重', () => {
    const result = ensureRequestedToolFacts({
      question: '这些待办的清单完成情况如何？',
      answer: '找到了三条待办。',
      usedTools: [queryTool('清单：3/4\n清单：0/4\n清单：3/4')],
    });

    expect(result.answer).toBe('找到了三条待办。\n\n清单进度（按查询结果顺序）：3/4、0/4。');
    expect(result.facts).toEqual(['3/4', '0/4']);
  });
});
