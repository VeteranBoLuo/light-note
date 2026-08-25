import { describe, expect, it } from 'vitest';
import {
  createGroundedAnswerTool,
  groundedOutputInternals,
  GROUNDED_OUTPUT_PROTOCOL_INSTRUCTION,
  validateGroundedAnswerArguments,
} from './groundedOutput.js';

describe('服务端权威引用输出', () => {
  const sources = [{ id: 's-1' }, { id: 's-2' }];

  it('模型只提交来源索引，服务端统一渲染引用', () => {
    expect(
      validateGroundedAnswerArguments(
        {
          blocks: [
            { markdown: '第一项事实。', sourceIndexes: [1] },
            { markdown: '## 结论\n第二项由两份材料共同支持。', sourceIndexes: [2, 1] },
          ],
        },
        sources,
        { complete: false },
      ),
    ).toEqual({
      kind: 'grounded_markdown',
      content: '第一项事实。\n\n[1]\n\n## 结论\n第二项由两份材料共同支持。\n\n[2] [1]',
    });
  });

  it('拒绝无来源和越界来源，并把模型手写编号降为普通文字', () => {
    expect(() =>
      validateGroundedAnswerArguments({ blocks: [{ markdown: '无来源', sourceIndexes: [] }] }, sources),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_OUTPUT_SOURCE_REQUIRED' }));
    expect(() =>
      validateGroundedAnswerArguments({ blocks: [{ markdown: '越界', sourceIndexes: [3] }] }, sources),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_OUTPUT_SOURCE_INVALID' }));
    expect(
      validateGroundedAnswerArguments(
        {
          blocks: [
            {
              markdown: '手写 [2] 会降为普通文字；行内代码 `arr[1]` 保持原样。',
              sourceIndexes: [1],
            },
          ],
        },
        sources,
      ).content,
    ).toBe('手写 [\u20602] 会降为普通文字；行内代码 `arr[1]` 保持原样。\n\n[1]');
    expect(() =>
      validateGroundedAnswerArguments({ blocks: [{ markdown: '字符串编号', sourceIndexes: ['1'] }] }, sources),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_OUTPUT_SOURCE_INVALID' }));
    expect(() =>
      validateGroundedAnswerArguments({ blocks: [{ markdown: '重复编号', sourceIndexes: [1, 1] }] }, sources),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_OUTPUT_SOURCE_INVALID' }));
    expect(() =>
      validateGroundedAnswerArguments(
        { blocks: [{ markdown: '未知字段', sourceIndexes: [1], citation: '[1]' }] },
        sources,
      ),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_STRUCTURED_OUTPUT_INVALID' }));
  });

  it('工具 Schema 的来源上界与本轮来源一致', () => {
    const tool = createGroundedAnswerTool(2);
    expect(tool.parameters.properties.blocks.items.properties.sourceIndexes.items.maximum).toBe(2);
    expect(GROUNDED_OUTPUT_PROTOCOL_INSTRUCTION).toContain('服务端生成');
  });

  it('只保留真实代码中的数字方括号，未闭合反引号不能绕过转义', () => {
    expect(groundedOutputInternals.neutralizeModelCitations('未闭合 ` 后的 [2]')).toBe('未闭合 ` 后的 [\u20602]');
    expect(groundedOutputInternals.neutralizeModelCitations('```js\narr[2]\n```\n正文 [2]')).toBe(
      '```js\narr[2]\n```\n正文 [\u20602]',
    );
    expect(groundedOutputInternals.neutralizeModelCitations('实体 &#91;2&#93; 也不是权威引用')).toBe(
      '实体 [\u20602] 也不是权威引用',
    );
  });
});
