import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callGroundedSkillModel, callGroundedSkillModelStream } from './model.js';

vi.mock('../agent/aiGateway.js', () => ({ requestAi: vi.fn(), requestAiStream: vi.fn() }));
const { requestAi, requestAiStream } = await import('../agent/aiGateway.js');

function groundedToolResponse(blocks) {
  return {
    content: '',
    toolCalls: [
      {
        function: {
          name: 'submit_grounded_answer',
          arguments: JSON.stringify({ blocks }),
        },
      },
    ],
  };
}

describe('grounded skill model', () => {
  beforeEach(() => {
    requestAi.mockReset();
    requestAiStream.mockReset();
  });

  it('把模型来源索引渲染成服务端权威引用，不再信任模型正文编号', async () => {
    requestAi.mockResolvedValueOnce(groundedToolResponse([{ markdown: '这是由材料支持的回答。', sourceIndexes: [1] }]));
    const result = await callGroundedSkillModel({
      messages: [{ role: 'user', content: '整理材料' }],
      sources: [{ id: 'note-1' }],
      coverage: { complete: false },
      modelPolicy: { maxTokens: 1000, temperature: 0.1, timeoutMs: 150000 },
      outputPolicy: { targetChars: 2000 },
      trace: { traceId: 'trace', taskType: 'test', stage: 'test' },
    });
    expect(result).toEqual({ kind: 'grounded_markdown', content: '这是由材料支持的回答。\n\n[1]' });
    expect(requestAi).toHaveBeenCalledOnce();
    expect(requestAi.mock.calls[0][1].toolChoice).toEqual({
      type: 'function',
      function: { name: 'submit_grounded_answer' },
    });
    expect(requestAi.mock.calls[0][1].timeoutMs).toBe(150000);
  });

  it('引用协议缺失时在同一个 execution 内只修复一次', async () => {
    requestAi
      .mockResolvedValueOnce({ content: '普通正文 [1]', toolCalls: [] })
      .mockResolvedValueOnce(groundedToolResponse([{ markdown: '修复后的正文。', sourceIndexes: [1] }]));
    const result = await callGroundedSkillModel({
      messages: [{ role: 'user', content: '整理材料' }],
      sources: [{ id: 'note-1' }],
      coverage: { complete: true },
      modelPolicy: { maxTokens: 1000, temperature: 0.1 },
      trace: { traceId: 'trace', taskType: 'test', stage: 'test' },
    });
    expect(result.content).toContain('修复后的正文');
    expect(requestAi).toHaveBeenCalledTimes(2);
    expect(requestAi.mock.calls[1][1]).toMatchObject({
      billingScope: 'platform',
      repairReasonCode: 'AI_SKILL_STRUCTURED_OUTPUT_MISSING',
      trace: { stage: 'test_repair' },
    });
  });

  it('修复后仍引用越界时硬失败', async () => {
    requestAi.mockResolvedValue(groundedToolResponse([{ markdown: '错误引用。', sourceIndexes: [2] }]));
    await expect(
      callGroundedSkillModel({
        messages: [{ role: 'user', content: '整理材料' }],
        sources: [{ id: 'note-1' }],
        coverage: { complete: true },
        modelPolicy: { maxTokens: 1000, temperature: 0.1 },
        trace: { traceId: 'trace', taskType: 'test', stage: 'test' },
      }),
    ).rejects.toMatchObject({ code: 'AI_SKILL_OUTPUT_SOURCE_INVALID' });
    expect(requestAi).toHaveBeenCalledTimes(2);
  });

  it('固定成果结构不合格时使用平台额度修复一次，不改变 Skill 或来源范围', async () => {
    requestAi
      .mockResolvedValueOnce(groundedToolResponse([{ markdown: '普通摘要。', sourceIndexes: [1] }]))
      .mockResolvedValueOnce(groundedToolResponse([{ markdown: '# 研究简报\n结论与证据。', sourceIndexes: [1] }]));
    const resultValidator = vi.fn((result) => {
      if (!String(result?.content || '').includes('# 研究简报')) {
        throw Object.assign(new Error('成果结构无效'), { code: 'AI_SKILL_OUTPUT_PROFILE_INVALID', status: 502 });
      }
      return result;
    });
    const result = await callGroundedSkillModel({
      messages: [{ role: 'user', content: '生成研究简报' }],
      sources: [{ id: 'note-1' }],
      coverage: { complete: true },
      modelPolicy: { maxTokens: 1000, temperature: 0.1 },
      resultValidator,
      resultRepairInstruction: '必须补齐结论、证据和待核验项。',
      trace: { traceId: 'trace', taskType: 'skill_toolbox_research_brief', stage: 'toolbox_profile' },
    });
    expect(result.content).toContain('# 研究简报');
    expect(resultValidator).toHaveBeenCalledTimes(2);
    expect(requestAi).toHaveBeenCalledTimes(2);
    expect(requestAi.mock.calls[1][1]).toMatchObject({
      billingScope: 'platform',
      repairReasonCode: 'AI_SKILL_OUTPUT_PROFILE_INVALID',
      trace: { stage: 'toolbox_profile_repair' },
    });
    expect(requestAi.mock.calls[1][0].at(-1).content).toContain('必须补齐结论、证据和待核验项');
  });

  it('流式调用透传无来源文字变换的正文增量', async () => {
    requestAiStream.mockImplementationOnce(async (_messages, options) => {
      options.onDelta('真实');
      options.onDelta('流式内容');
      return { content: '真实流式内容' };
    });
    const deltas = [];
    const result = await callGroundedSkillModelStream({
      messages: [{ role: 'user', content: '润色' }],
      sources: [],
      coverage: { complete: true },
      modelPolicy: { maxTokens: 1000, temperature: 0.1 },
      trace: { traceId: 'trace', taskType: 'test', stage: 'test' },
      onDelta: (value) => deltas.push(value),
    });
    expect(deltas).toEqual(['真实', '流式内容']);
    expect(result.content).toBe('真实流式内容');
  });

  it('无来源流式首版过短时先 reset 再发送修复版', async () => {
    requestAiStream
      .mockImplementationOnce(async (_messages, options) => {
        options.onDelta('短');
        return { content: '短' };
      })
      .mockImplementationOnce(async (_messages, options) => {
        options.onDelta('这是修复后满足长度门禁的完整内容');
        return { content: '这是修复后满足长度门禁的完整内容' };
      });
    const events = [];
    const result = await callGroundedSkillModelStream({
      messages: [{ role: 'user', content: '扩写' }],
      sources: [],
      coverage: { complete: true },
      modelPolicy: { maxTokens: 1000, temperature: 0.1 },
      outputPolicy: { minimumChars: 15 },
      trace: { traceId: 'trace', taskType: 'test', stage: 'test' },
      onDelta: (value) => events.push(value),
      onReset: () => events.push('RESET'),
    });
    expect(events).toEqual(['短', 'RESET', '这是修复后满足长度门禁的完整内容']);
    expect(result.content).toContain('修复后');
    expect(requestAiStream.mock.calls[1][1].billingScope).toBe('platform');
    expect(requestAiStream.mock.calls[1][1].repairReasonCode).toBe('AI_SKILL_OUTPUT_TOO_SHORT');
  });

  it('带来源的真实参数流只发布完整合法段落，最终结果一致', async () => {
    const blocks = [
      { markdown: '正文含有 \"引号\"、{括号} 和换行\n第二行', sourceIndexes: [1] },
      { markdown: '第二段', sourceIndexes: [1] },
    ];
    const response = groundedToolResponse(blocks);
    const args = response.toolCalls[0].function.arguments;
    const deltas = [];
    requestAiStream.mockImplementation(async (_messages, options) => {
      for (let i = 1; i <= args.length; i++)
        options.onToolCallDelta({ index: 0, name: 'submit_grounded_answer', arguments: args.slice(0, i) });
      expect(deltas).toHaveLength(2); // 在 Provider Promise 完成前已输出
      return response;
    });
    const result = await callGroundedSkillModelStream({
      messages: [],
      sources: [{ id: 's-1' }],
      modelPolicy: { maxTokens: 1400 },
      onDelta: (value) => deltas.push(value),
    });
    expect(deltas.join('')).toBe(result.content);
    expect(requestAi).not.toHaveBeenCalled();
  });

  it('坏来源不透传，修复重置草稿且只使用一次平台预算', async () => {
    const deltas = [];
    const invalid = groundedToolResponse([{ markdown: '不可信', sourceIndexes: [2] }]);
    const valid = groundedToolResponse([{ markdown: '已修复', sourceIndexes: [1] }]);
    requestAiStream
      .mockImplementationOnce(async (_m, options) => {
        options.onToolCallDelta({
          index: 0,
          name: 'submit_grounded_answer',
          arguments: invalid.toolCalls[0].function.arguments,
        });
        expect(deltas).toEqual([]);
        return invalid;
      })
      .mockImplementationOnce(async (_m, options) => {
        options.onToolCallDelta({
          index: 0,
          name: 'submit_grounded_answer',
          arguments: valid.toolCalls[0].function.arguments,
        });
        return valid;
      });
    await callGroundedSkillModelStream({
      messages: [],
      sources: [{ id: 's-1' }],
      modelPolicy: { maxTokens: 1400 },
      onDelta: (value) => deltas.push(value),
      onReset: () => deltas.push('RESET'),
    });
    expect(deltas).toEqual(['RESET', '已修复\n\n[1]']);
    expect(requestAiStream.mock.calls[1][1].billingScope).toBe('platform');
    requestAiStream.mockReset().mockResolvedValue(invalid);
    await expect(
      callGroundedSkillModelStream({ messages: [], sources: [{ id: 's-1' }], modelPolicy: { maxTokens: 1400 } }),
    ).rejects.toMatchObject({ code: 'AI_SKILL_OUTPUT_SOURCE_INVALID' });
    expect(requestAiStream).toHaveBeenCalledTimes(2);
  });
});
