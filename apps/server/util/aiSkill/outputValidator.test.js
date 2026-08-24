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

  it('覆盖不完整时拒绝绝对结论', () => {
    expect(() =>
      validateGroundedMarkdownOutput({ content: '这些就是全部结果 [1]。', sources, coverage: { complete: false } }),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_OUTPUT_COVERAGE_OVERCLAIM' }));
  });

  it('目标字数是服务端硬门禁，而不是仅依赖提示词', () => {
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
        content: '这是一段已经达到最低字符要求的完整回答。',
        sources: [],
        coverage: { complete: true },
        minimumChars: 20,
      }),
    ).toMatchObject({ kind: 'grounded_markdown' });
  });
});
