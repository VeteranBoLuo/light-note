import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManorError } from '@lightnote/shared/manor';
const mocks = vi.hoisted(() => ({ get: vi.fn(), execute: vi.fn() }));
vi.mock('../util/agent/data.js', () => ({ resultData: (data, status = 200, message) => ({ status, data, message }) }));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: (req, res) => {
  if (!req.user?.id || req.user.role === 'visitor') { res.send({ status: 403 }); return false; }
  return true;
} }));
vi.mock('../util/common.js', () => ({ resultData: (data, status = 200, message) => ({ status, data, message }), L: (_req, zh) => zh }));
vi.mock('../util/agent/logSafety.js', () => ({ stableAgentErrorCode: () => 'SAFE_ERROR' }));
vi.mock('../util/services/knowledgeManorService.js', () => ({ knowledgeManorService: mocks }));
import { getKnowledgeManor, runKnowledgeManorCommand } from './knowledgeManorHandle.js';

describe('庄园接口账号与开关边界', () => {
  const req = extra => ({ user: { id: 'owner', role: 'root' }, body: { action: 'adopt' }, ...extra });
  const res = () => ({ send: vi.fn() });
  beforeEach(() => { vi.stubEnv('KNOWLEDGE_MANOR_ENABLED', 'true'); vi.clearAllMocks(); });
  afterEach(() => vi.unstubAllEnvs());
  it('关闭入口同时拒绝直连 API，不读取或改变存档', async () => {
    vi.stubEnv('KNOWLEDGE_MANOR_ENABLED', 'false');
    for (const handler of [getKnowledgeManor, runKnowledgeManorCommand]) {
      const response = res(); await handler(req(), response);
      expect(response.send).toHaveBeenCalledWith(expect.objectContaining({ status: 503, data: { code: 'MANOR_UNAVAILABLE' } }));
    }
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([{ user: null }, { user: { id: 'visitor', role: 'visitor' } }, { adminContext: { mode: 'preview' } }])('拒绝游客、缺少登录态和管理员代管 %j', async extra => {
    const response = res(); await runKnowledgeManorCommand(req(extra), response);
    expect(response.send.mock.calls[0][0].status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each([
    ['internal', 'root', true], ['internal', 'test', true], ['internal', 'user', false], ['internal', 'unknown', false],
    ['all', 'root', true], ['all', 'test', true], ['all', 'user', true], ['all', 'unknown', false],
    ['typo', 'user', false], ['typo', 'test', true],
  ])('开放范围 %s 下 %s 账号能否直连：%s', async (audience, role, allowed) => {
    vi.stubEnv('KNOWLEDGE_MANOR_AUDIENCE', audience);
    mocks.get.mockResolvedValue({ revision: 0 });
    const response = res(); await getKnowledgeManor(req({ user: { id: 'owner', role } }), response);
    expect(response.send.mock.calls[0][0]).toMatchObject(allowed ? { status: 200 } : { status: 403, data: { code: 'MANOR_ACCOUNT_UNAVAILABLE' } });
    expect(mocks.get).toHaveBeenCalledTimes(allowed ? 1 : 0);
  });
  it('未设置开放范围时只放行内部账号，普通账号也不能执行命令', async () => {
    const response = res(); await runKnowledgeManorCommand(req({ user: { id: 'owner', role: 'user' } }), response);
    expect(response.send.mock.calls[0][0].status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('只使用认证账号，不接受 body 中的其他用户', async () => {
    const body = { action: 'adopt', userId: 'other' };
    mocks.execute.mockResolvedValueOnce({ revision: 1 });
    const response = res(); await runKnowledgeManorCommand(req({ body }), response);
    expect(mocks.execute).toHaveBeenCalledWith('owner', body);
    expect(response.send.mock.calls[0][0].status).toBe(200);
  });
  it('已知冲突保留稳定错误码，未知异常不泄露 SQL、用户或 provider 内容', async () => {
    mocks.execute.mockRejectedValueOnce(new ManorError('MANOR_REVISION_CONFLICT'));
    const conflict = res(); await runKnowledgeManorCommand(req(), conflict);
    expect(conflict.send.mock.calls[0][0]).toMatchObject({ status: 409, data: { code: 'MANOR_REVISION_CONFLICT' } });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.execute.mockRejectedValueOnce(new Error('private SQL and credentials'));
    const failure = res(); await runKnowledgeManorCommand(req(), failure);
    expect(failure.send.mock.calls[0][0]).toMatchObject({ status: 500, data: { code: 'MANOR_REQUEST_FAILED' } });
    expect(JSON.stringify([failure.send.mock.calls, log.mock.calls])).not.toContain('private');
    log.mockRestore();
  });
});
