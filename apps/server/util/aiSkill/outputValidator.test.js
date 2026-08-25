import { describe, expect, it } from 'vitest';
import { validateGroundedMarkdownOutput } from './outputValidator.js';

describe('validateGroundedMarkdownOutput', () => {
  const sources = [{ id: 'source-1' }, { id: 'source-2' }];

  it('接受只引用本轮来源的回答', () => {
    expect(
      validateGroundedMarkdownOutput({
        content: '材料说明了第一点 [1]，也补充了第二点 [2]。',
        sources,
        coverage: { complete: true },
      }),
    ).toEqual({ kind: 'grounded_markdown', content: '材料说明了第一点 [1]，也补充了第二点 [2]。' });
  });

  it('拒绝无来源和伪造来源编号', () => {
    expect(() => validateGroundedMarkdownOutput({ content: '这是结论。', sources })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_SOURCE_REQUIRED' }),
    );
    expect(() => validateGroundedMarkdownOutput({ content: '这是结论 [3]。', sources })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_OUTPUT_SOURCE_INVALID' }),
    );
  });

  it('覆盖限制由结构化来源和 coverage 事实表达，不再用关键词误杀安全说明', () => {
    expect(
      validateGroundedMarkdownOutput({
        content: '由于部分材料不可读，无法覆盖所有细节 [1]。',
        sources,
        coverage: { complete: false },
      }),
    ).toMatchObject({ kind: 'grounded_markdown' });
  });

  it('无来源文字变换仍可声明服务端最低字数门禁', () => {
    expect(() =>
      validateGroundedMarkdownOutput({
        content: '过短的回答',
        sources: [],
        coverage: { complete: true },
        minimumChars: 20,
      }),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_OUTPUT_TOO_SHORT' }));

    expect(
      validateGroundedMarkdownOutput({
        content: '这是一段已经达到最低字符要求的完整回答，也可以保留代码 arr[1]。',
        sources: [],
        coverage: { complete: true },
        minimumChars: 20,
      }),
    ).toMatchObject({ kind: 'grounded_markdown' });
  });
});
