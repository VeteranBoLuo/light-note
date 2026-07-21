import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveIdentity: vi.fn(),
  recover: vi.fn(),
}));

vi.mock('../util/aiResponseRecoveryService.js', () => ({
  resolveAiResponseRecoveryIdentity: mocks.resolveIdentity,
  recoverAiResponse: mocks.recover,
}));

const { recoverAgentResponse } = await import('./aiResponseHandle.js');

function response() {
  return {
    status: vi.fn(function () {
      return this;
    }),
    send: vi.fn(function () {
      return this;
    }),
  };
}

describe('recoverAgentResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveIdentity.mockReturnValue({
      actorUserId: 'user-1',
      subjectUserId: 'user-1',
      adminContextMode: 'normal',
      adminContextId: null,
    });
  });

  it('只使用服务端身份解析结果恢复 requestId 之后的事件', async () => {
    mocks.recover.mockResolvedValue({
      protocolVersion: '2.0',
      requestId: 'request-1',
      recovered: true,
      snapshot: { answer: '答案', status: 'completed' },
      events: [],
      lastEventId: 8,
    });
    const req = {
      body: {
        requestId: 'request-1',
        lastEventId: 5,
        actorUserId: 'attacker-controlled',
        subjectUserId: 'attacker-controlled',
      },
      user: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await recoverAgentResponse(req, res);

    expect(mocks.resolveIdentity).toHaveBeenCalledWith(req);
    expect(mocks.recover).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'user-1', subjectUserId: 'user-1' }),
      { requestId: 'request-1', lastEventId: 5 },
    );
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recovered: true, lastEventId: 8 }), status: 200 }),
    );
  });

  it('保留可处理错误的 HTTP 状态与稳定错误码', async () => {
    const error = new Error('AI_RESPONSE_RECOVERY_NOT_FOUND: 恢复结果不存在或已过期');
    error.code = 'AI_RESPONSE_RECOVERY_NOT_FOUND';
    error.status = 404;
    mocks.recover.mockRejectedValue(error);
    const res = response();

    await recoverAgentResponse({ body: { requestId: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { code: 'AI_RESPONSE_RECOVERY_NOT_FOUND' },
        status: 404,
        msg: '恢复结果不存在或已过期',
      }),
    );
  });

  it('服务端异常不回显数据库细节', async () => {
    mocks.recover.mockRejectedValue(new Error('ER_BAD_FIELD_ERROR: secret_column'));
    const res = response();

    await recoverAgentResponse({ body: { requestId: 'request-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: 500, msg: '暂时无法恢复 AI 回答，请稍后重试。' }),
    );
  });
});
