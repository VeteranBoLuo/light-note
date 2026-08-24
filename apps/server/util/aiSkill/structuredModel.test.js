import { describe, expect, it, vi } from 'vitest';
import { aiSkillStructuredModelInternals, callStructuredSkillModel } from './structuredModel.js';

vi.mock('../agent/aiGateway.js', () => ({ requestAi: vi.fn() }));
const { requestAi } = await import('../agent/aiGateway.js');

const tool = { name: 'submit', description: 'submit', parameters: { type: 'object', properties: {} } };

describe('structured skill model', () => {
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
      modelPolicy: { maxTokens: 500, temperature: 0.1 },
      trace: { stage: 'todo_parse', taskType: 'todo_parse', traceId: 'trace' },
    });
    expect(result.title).toBe('任务');
    expect(requestAi).toHaveBeenCalledTimes(2);
    expect(requestAi.mock.calls[0][1].toolChoice).toEqual({ type: 'function', function: { name: 'submit' } });
  });
});
