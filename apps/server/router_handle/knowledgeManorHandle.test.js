import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManorError } from '@lightnote/shared/manor';
const mocks = vi.hoisted(() => ({ get: vi.fn(), execute: vi.fn(), rootQuery: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { query: mocks.rootQuery } }));
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
  beforeEach(() => { vi.stubEnv('KNOWLEDGE_MANOR_ENABLED', 'true'); vi.clearAllMocks(); mocks.rootQuery.mockResolvedValue([[{ role: 'root', del_flag: 0 }]]); });
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
  it.each(['user', 'test', 'unknown'])('开关开启时，%s 仍不能直连读取或执行庄园', async role => {
    for (const handler of [getKnowledgeManor, runKnowledgeManorCommand]) {
      const response = res(); await handler(req({ user: { id: 'owner', role } }), response);
      expect(response.send.mock.calls[0][0].status).toBe(403);
    }
    expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.rootQuery).not.toHaveBeenCalled();
  });
  it('登录后已被降为普通用户的旧 Root 会话也不能进入', async () => {
    mocks.rootQuery.mockResolvedValue([[{ role: 'user', del_flag: 0 }]]);
    const response = res(); await getKnowledgeManor(req(), response);
    expect(response.send.mock.calls[0][0].status).toBe(403);
    expect(mocks.get).not.toHaveBeenCalled();
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
