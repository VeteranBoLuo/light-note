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
      modelPolicy: { maxTokens: 1000, temperature: 0.1 },
      outputPolicy: { targetChars: 2000 },
      trace: { traceId: 'trace', taskType: 'test', stage: 'test' },
    });
    expect(result).toEqual({ kind: 'grounded_markdown', content: '这是由材料支持的回答。\n\n[1]' });
    expect(requestAi).toHaveBeenCalledOnce();
    expect(requestAi.mock.calls[0][1].toolChoice).toEqual({
      type: 'function',
      function: { name: 'submit_grounded_answer' },
    });
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

  it('拒绝把带来源结果走未校验的流式通道', async () => {
    await expect(
      callGroundedSkillModelStream({
        messages: [],
        sources: [{ id: 's-1' }],
        modelPolicy: { maxTokens: 100, temperature: 0 },
      }),
    ).rejects.toMatchObject({ code: 'AI_SKILL_STREAM_STRUCTURED_REQUIRED' });
    expect(requestAiStream).not.toHaveBeenCalled();
  });
});
