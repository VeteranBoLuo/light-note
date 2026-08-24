import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/http/request', () => ({ apiBaseGet: vi.fn(), apiBasePost: vi.fn() }));
const { apiBaseGet, apiBasePost } = await import('@/http/request');
const { AiSkillApiError, executeAiSkill, getAiSkillsConfig } = await import('./aiSkillApi');

const request = {
  protocolVersion: 1,
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  skillId: 'file.summarize',
  skillVersion: 1,
  threadId: null,
  input: {},
  scope: { resourceRefs: [{ type: 'file', id: '1' }] },
  client: { locale: 'zh-CN', timezone: 'Asia/Shanghai', surface: 'file.preview' },
} as const;

const response = {
  protocolVersion: 1,
  requestId: request.requestId,
  skillId: request.skillId,
  skillVersion: 1,
  status: 'completed',
  threadId: null,
  scopeDigest: null,
  result: { kind: 'text', content: '完成' },
  sources: [],
  coverage: { complete: true, warnings: [] },
  availableActions: [],
  receipt: { modelCalled: true },
  error: null,
} as const;

describe('aiSkillApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('读取服务端可用 Skills，而不是在前端猜功能开关', async () => {
    apiBaseGet.mockResolvedValue({ status: 200, data: { protocolVersion: 1, availableSkills: [] } });
    await expect(getAiSkillsConfig()).resolves.toMatchObject({ protocolVersion: 1 });
    expect(apiBaseGet).toHaveBeenCalledWith('/api/ai/skills/config', undefined, { silent: true });
  });

  it('统一通过封闭 Skill 协议执行', async () => {
    apiBasePost.mockResolvedValue({ status: 200, data: response });
    await expect(executeAiSkill(request)).resolves.toMatchObject({ status: 'completed' });
    expect(apiBasePost).toHaveBeenCalledWith('/api/ai/skills/execute', request, { silent: true });
  });

  it('业务失败信封统一抛出稳定错误，不让页面把失败当成空结果', async () => {
    apiBasePost.mockResolvedValue({
      status: 429,
      msg: '今日 AI 额度已用完',
      data: { code: 'AI_QUOTA_EXCEEDED' },
    });

    await expect(executeAiSkill(request)).rejects.toEqual(
      expect.objectContaining({
        name: 'AiSkillApiError',
        code: 'AI_QUOTA_EXCEEDED',
        message: '今日 AI 额度已用完',
        status: 429,
      }),
    );
  });

  it('Axios 错误优先使用服务端稳定 code 和文案，而不是 ERR_BAD_REQUEST', async () => {
    apiBasePost.mockRejectedValue({
      code: 'ERR_BAD_REQUEST',
      message: 'Request failed with status code 409',
      response: {
        status: 409,
        data: {
          status: 409,
          msg: '材料已更新，请重新开始',
          data: { code: 'AI_SKILL_SCOPE_STALE' },
        },
      },
    });

    await expect(executeAiSkill(request)).rejects.toBeInstanceOf(AiSkillApiError);
    await expect(executeAiSkill(request)).rejects.toMatchObject({
      code: 'AI_SKILL_SCOPE_STALE',
      message: '材料已更新，请重新开始',
      status: 409,
    });
  });

  it('统一请求层压平 429 后仍恢复服务端额度业务码', async () => {
    apiBasePost.mockRejectedValue({
      code: 'HTTP_429',
      message: '今日 AI 额度已用完，请明天再试',
      status: 429,
      data: { code: 'AI_QUOTA_EXCEEDED' },
    });

    await expect(executeAiSkill(request)).rejects.toMatchObject({
      code: 'AI_QUOTA_EXCEEDED',
      message: '今日 AI 额度已用完，请明天再试',
      status: 429,
    });
  });
});
