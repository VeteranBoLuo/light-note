import { describe, expect, it, vi } from 'vitest';
import { aiSkillStructuredModelInternals, callStructuredSkillModel, estimateStructuredSkillModelTokens } from './structuredModel.js';

vi.mock('../agent/aiGateway.js', () => ({ requestAi: vi.fn(), estimateAiProviderTokens: vi.fn(() => 2048) }));
const { requestAi, estimateAiProviderTokens } = await import('../agent/aiGateway.js');

const tool = { name: 'submit', description: 'submit', parameters: { type: 'object', properties: {} } };

describe('structured skill model', () => {
  it('结构化请求估算包含工具 Schema 与输出预算，且不外发模型请求', () => {
    requestAi.mockClear();
    const messages = [{ role: 'user', content: '整理资源' }];
    expect(estimateStructuredSkillModelTokens({ messages, structuredTool: tool, modelPolicy: { maxTokens: 1200 } })).toBe(2048);
    expect(estimateAiProviderTokens).toHaveBeenCalledWith(messages, {
      maxTokens: 1200,
      tools: [{ type: 'function', function: tool }],
    });
    expect(requestAi).not.toHaveBeenCalled();
  });
  it('向定向修复器传递已解析的完整工具草稿，而不是空 assistant 文本', async () => {
    requestAi.mockReset();
    const invalidArguments = { title: 'old title', sections: ['keep context'] };
    requestAi
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ function: { name: 'submit', arguments: JSON.stringify(invalidArguments) } }],
      })
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ function: { name: 'submit', arguments: '{"title":"fixed"}' } }],
      });
    const buildRepairInstruction = vi.fn(() => 'fix draft');
    const validateArguments = vi
      .fn()
      .mockImplementationOnce(() => {
        throw Object.assign(new Error('invalid'), { code: 'TEST_INVALID' });
      })
      .mockImplementationOnce((args) => args);
    await expect(
      callStructuredSkillModel({
        messages: [],
        structuredTool: tool,
        validateArguments,
        repairableErrorCodes: ['TEST_INVALID'],
        buildRepairInstruction,
        modelPolicy: { maxTokens: 500 },
      }),
    ).resolves.toEqual({ title: 'fixed' });
    expect(buildRepairInstruction).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: 'submit', invalidArguments }),
    );
    expect(requestAi).toHaveBeenCalledTimes(2);
    requestAi.mockReset();
  });
  it('拒绝多余或错误工具调用', () => {
    expect(() =>
      aiSkillStructuredModelInternals.parseToolArguments(
        {
          toolCalls: [
            { function: { name: 'submit', arguments: '{}' } },
            { function: { name: 'other', arguments: '{}' } },
          ],
        },
        'submit',
      ),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_STRUCTURED_OUTPUT_MISSING' }));
  });

  it('结构协议缺失时只在同一 execution 内修复一次', async () => {
    requestAi.mockResolvedValueOnce({ content: '普通文本', toolCalls: [] }).mockResolvedValueOnce({
      content: '',
      toolCalls: [{ function: { name: 'submit', arguments: '{"title":"任务"}' } }],
    });
    const result = await callStructuredSkillModel({
      messages: [{ role: 'user', content: '创建任务' }],
      structuredTool: tool,
      validateArguments: (args) => ({ kind: 'structured_draft', ...args }),
      modelPolicy: { maxTokens: 500, temperature: 0.1, timeoutMs: 150000 },
      trace: { stage: 'todo_parse', taskType: 'todo_parse', traceId: 'trace' },
    });
    expect(result.title).toBe('任务');
    expect(requestAi).toHaveBeenCalledTimes(2);
    expect(requestAi.mock.calls[0][1].toolChoice).toEqual({ type: 'function', function: { name: 'submit' } });
    expect(requestAi.mock.calls[0][1].timeoutMs).toBe(150000);
    expect(requestAi.mock.calls[1][1].billingScope).toBe('platform');
    expect(requestAi.mock.calls[1][1].repairReasonCode).toBe('AI_SKILL_STRUCTURED_OUTPUT_MISSING');
  });
});

it('结构化修复前重新检查租约，失效不得二次外发', async () => {
  requestAi.mockReset();
  requestAi.mockResolvedValueOnce({ content: 'bad', toolCalls: [] });
  const beforeRequest = vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(Object.assign(new Error('lost'), { code: 'ORGANIZE_LEASE_LOST' }));
  await expect(callStructuredSkillModel({ messages: [], structuredTool: tool, validateArguments: x => x, modelPolicy: { maxTokens: 300 }, beforeRequest })).rejects.toMatchObject({ code: 'ORGANIZE_LEASE_LOST' });
  expect(requestAi).toHaveBeenCalledTimes(1);
});
