import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/http/request', () => ({ default: vi.fn(), apiBaseGet: vi.fn(), apiBasePost: vi.fn() }));
const { default: httpRequest, apiBaseGet, apiBasePost } = await import('@/http/request');
const { AiSkillApiError, aiSkillApiInternals, executeAiSkill, executeAiSkillStream, getAiSkillsConfig } =
  await import('./aiSkillApi');

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

  it('本次任务额度不足时保留预算差额，供所有界面生成统一提示', async () => {
    apiBasePost.mockRejectedValue({
      code: 'HTTP_429',
      message: '当前仍有额度，但不足以完成本次任务',
      status: 429,
      data: {
        code: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST',
        requiredTokens: 26_903,
        availableTokens: 21_700,
      },
    });

    await expect(executeAiSkill(request)).rejects.toMatchObject({
      code: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST',
      requiredTokens: 26_903,
      availableTokens: 21_700,
      isPublicMessage: true,
    });
  });

  it('SSE 帧解析支持事件名与 JSON 数据', () => {
    expect(aiSkillApiInternals.parseSseFrame('event: delta\ndata: {"content":"片段"}')).toEqual({
      event: 'delta',
      data: { content: '片段' },
    });
  });

  it('按网络分块逐段消费真实 SSE，并以 complete 事件作为最终结果', async () => {
    const streamRequest = { ...request, skillId: 'note.transform_text' };
    const streamResponse = {
      ...response,
      skillId: 'note.transform_text',
      result: { kind: 'text', content: '第一段第二段' },
    };
    const payload = [
      `event: start\ndata: ${JSON.stringify({ requestId: streamRequest.requestId })}\n\n`,
      'event: delta\ndata: {"content":"第一段"}\n\n',
      'event: reset\ndata: {}\n\n',
      'event: delta\ndata: {"content":"第二段"}\n\n',
      `event: complete\ndata: ${JSON.stringify(streamResponse)}\n\n`,
    ].join('');
    const encoder = new TextEncoder();
    const chunks = [payload.slice(0, 39), payload.slice(39, 111), payload.slice(111)];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    });
    vi.mocked(httpRequest).mockResolvedValue({ data: stream } as any);
    const events: string[] = [];

    await expect(
      executeAiSkillStream(streamRequest, {
        onStart: () => events.push('start'),
        onDelta: (content) => events.push(content),
        onReset: () => events.push('reset'),
      }),
    ).resolves.toMatchObject({ status: 'completed', result: { content: '第一段第二段' } });

    expect(events).toEqual(['start', '第一段', 'reset', '第二段']);
    expect(httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/ai/skills/stream',
        method: 'post',
        data: streamRequest,
        adapter: 'fetch',
        responseType: 'stream',
      }),
    );
  });
});
