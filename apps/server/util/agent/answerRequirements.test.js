import { describe, expect, it } from 'vitest';
import { applyAgentAnswerRequirements, normalizeAgentAnswerRequirements } from './answerRequirements.js';

describe('Agent 最终回答事实要求', () => {
  it('已包含任一等价事实时不重复追加', () => {
    const requirements = normalizeAgentAnswerRequirements([
      {
        id: 'todo.progress',
        anyOf: ['3/4', '已完成 3 项，还差 1 项'],
        appendText: '清单进度：已完成 3 项，还差 1 项（3/4）。',
      },
    ]);
    expect(applyAgentAnswerRequirements('这条待办的清单是 3 / 4。', requirements)).toEqual({
      answer: '这条待办的清单是 3 / 4。',
      addedCount: 0,
    });
  });

  it('模型遗漏时只追加工具声明的安全事实句', () => {
    expect(
      applyAgentAnswerRequirements('已定位到目标待办。', [
        {
          id: 'todo.progress',
          anyOf: ['3/4'],
          appendText: '清单进度：已完成 3 项，还差 1 项（3/4）。',
        },
      ]),
    ).toEqual({
      answer: '已定位到目标待办。\n\n清单进度：已完成 3 项，还差 1 项（3/4）。',
      addedCount: 1,
    });
  });

  it('无效与重复声明会被统一收口', () => {
    const requirements = normalizeAgentAnswerRequirements([
      null,
      { id: 'same', anyOf: ['事实'], appendText: '事实。' },
      { id: 'same', anyOf: ['另一事实'], appendText: '另一事实。' },
      { id: 'missing', anyOf: [], appendText: '不会进入。' },
    ]);
    expect(requirements).toHaveLength(1);
    expect(requirements[0]).toEqual({ id: 'same', anyOf: ['事实'], appendText: '事实。', onMissing: 'append' });
  });

  it('工具声明权威替换时丢弃相互矛盾的模型叙述，只保留安全事实', () => {
    expect(
      applyAgentAnswerRequirements(
        '富文本笔记只有 5 条。',
        [
          {
            id: 'note.type_breakdown',
            anyOf: ['富文本67、Markdown2、手绘16'],
            appendText: '笔记类型精确分布：富文本 67 条、Markdown 2 条、手绘 16 条。',
            onMissing: 'replace',
          },
        ],
        { allowAuthoritativeReplacement: true },
      ),
    ).toEqual({
      answer: '笔记类型精确分布：富文本 67 条、Markdown 2 条、手绘 16 条。',
      addedCount: 1,
    });
  });

  it('权威替换不因模型包含正确片段而保留同段中的矛盾扩写', () => {
    expect(
      applyAgentAnswerRequirements(
        '富文本 67 条、Markdown 2 条、手绘 16 条，但富文本可能只有 5 条。',
        [
          {
            id: 'note.type_breakdown',
            anyOf: ['富文本 67 条、Markdown 2 条、手绘 16 条'],
            appendText: '笔记类型精确分布：富文本 67 条、Markdown 2 条、手绘 16 条。',
            onMissing: 'replace',
          },
        ],
        { allowAuthoritativeReplacement: true },
      ),
    ).toEqual({
      answer: '笔记类型精确分布：富文本 67 条、Markdown 2 条、手绘 16 条。',
      addedCount: 0,
    });
  });

  it('复合工具场景未授权替换时仍只追加，不吞掉其他工具回答', () => {
    const result = applyAgentAnswerRequirements('另外还有 6 条书签。', [
      {
        id: 'note.type_breakdown',
        anyOf: ['富文本67、Markdown2、手绘16'],
        appendText: '笔记类型精确分布：富文本 67 条、Markdown 2 条、手绘 16 条。',
        onMissing: 'replace',
      },
    ]);
    expect(result.answer).toContain('另外还有 6 条书签。');
    expect(result.answer).toContain('笔记类型精确分布');
  });
});
