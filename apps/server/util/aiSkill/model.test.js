import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callGroundedSkillModel } from './model.js';

vi.mock('../agent/aiGateway.js', () => ({ requestAi: vi.fn() }));
const { requestAi } = await import('../agent/aiGateway.js');

describe('grounded skill model', () => {
  beforeEach(() => requestAi.mockReset());

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
});
