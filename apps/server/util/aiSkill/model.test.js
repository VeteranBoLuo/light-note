import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callGroundedSkillModel, callGroundedSkillModelStream } from './model.js';

vi.mock('../agent/aiGateway.js', () => ({ requestAi: vi.fn(), requestAiStream: vi.fn() }));
const { requestAi, requestAiStream } = await import('../agent/aiGateway.js');

describe('grounded skill model', () => {
  beforeEach(() => {
    requestAi.mockReset();
    requestAiStream.mockReset();
  });

  it('输出过短时在同一个 execution 内只修复一次', async () => {
    requestAi
      .mockResolvedValueOnce({ content: '太短 [1]' })
      .mockResolvedValueOnce({ content: '这是经过补充后达到长度要求且仍只引用真实材料的回答内容。[1]' });
    const result = await callGroundedSkillModel({
      messages: [{ role: 'user', content: '整理材料' }],
      sources: [{ id: 'note-1' }],
      coverage: { complete: true },
      modelPolicy: { maxTokens: 1000, temperature: 0.1 },
      outputPolicy: { minimumChars: 20 },
      trace: { traceId: 'trace', taskType: 'test', stage: 'test' },
    });
    expect(result.content.length).toBeGreaterThanOrEqual(20);
    expect(requestAi).toHaveBeenCalledTimes(2);
    expect(requestAi.mock.calls[1][1].trace.stage).toBe('test_repair');
  });

  it('修复后仍不合格时硬失败，禁止把短文冒充成功', async () => {
    requestAi.mockResolvedValue({ content: '仍然太短 [1]' });
    await expect(
      callGroundedSkillModel({
        messages: [{ role: 'user', content: '整理材料' }],
        sources: [{ id: 'note-1' }],
        coverage: { complete: true },
        modelPolicy: { maxTokens: 1000, temperature: 0.1 },
        outputPolicy: { minimumChars: 100 },
        trace: { traceId: 'trace', taskType: 'test', stage: 'test' },
      }),
    ).rejects.toMatchObject({ code: 'AI_SKILL_OUTPUT_TOO_SHORT' });
    expect(requestAi).toHaveBeenCalledTimes(2);
  });

  it('流式调用透传正文增量并返回同一份最终门禁结果', async () => {
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

  it('流式首版需修复时先 reset 再发送修复版', async () => {
    requestAiStream
      .mockImplementationOnce(async (_messages, options) => {
        options.onDelta('短 [1]');
        return { content: '短 [1]' };
      })
      .mockImplementationOnce(async (_messages, options) => {
        options.onDelta('这是修复后满足长度门禁的完整内容 [1]');
        return { content: '这是修复后满足长度门禁的完整内容 [1]' };
      });
    const events = [];
    const result = await callGroundedSkillModelStream({
      messages: [{ role: 'user', content: '整理' }],
      sources: [{ id: 'note-1' }],
      coverage: { complete: true },
      modelPolicy: { maxTokens: 1000, temperature: 0.1 },
      outputPolicy: { minimumChars: 15 },
      trace: { traceId: 'trace', taskType: 'test', stage: 'test' },
      onDelta: (value) => events.push(value),
      onReset: () => events.push('RESET'),
    });
    expect(events).toEqual(['短 [1]', 'RESET', '这是修复后满足长度门禁的完整内容 [1]']);
    expect(result.content).toContain('修复后');
  });
});
