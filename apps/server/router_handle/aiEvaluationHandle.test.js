import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  listRuns: vi.fn(),
  startRun: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.poolQuery } }));
vi.mock('../util/aiEvaluationService.js', () => ({
  listAiLiveSmokeRuns: mocks.listRuns,
  startAiLiveSmokeRun: mocks.startRun,
}));

const handle = await import('./aiEvaluationHandle.js');

function response() {
  return { send: vi.fn() };
}

describe('AI 冒烟管理员接口', () => {
  beforeEach(() => vi.clearAllMocks());

  it('非 Root 无法读取或启动真实冒烟', async () => {
    const res = response();
    await handle.startRun({ user: { id: 'user-1', role: 'user' }, body: { repeat: 1 } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(mocks.startRun).not.toHaveBeenCalled();
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it('Root 需经数据库复核后才可启动，并只传递受控轮数', async () => {
    mocks.poolQuery.mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]]);
    mocks.startRun.mockResolvedValueOnce({ id: 'run-1', status: 'queued', repeatCount: 2, caseCount: 6 });
    const res = response();
    await handle.startRun({ user: { id: 'root-1', role: 'root' }, body: { suite: 'full', repeat: 2 } }, res);
    expect(mocks.startRun).toHaveBeenCalledWith({ triggeredBy: 'root-1', suite: 'full', repeat: 2 });
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: 200, data: expect.objectContaining({ id: 'run-1' }) }),
    );
  });

  it('未知测试集返回 400', async () => {
    mocks.poolQuery.mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]]);
    mocks.startRun.mockRejectedValueOnce(Object.assign(new Error('suite'), { code: 'SUITE_NOT_SUPPORTED' }));
    const res = response();
    await handle.startRun({ user: { id: 'root-1', role: 'root' }, body: { suite: 'unknown', repeat: 1 } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });

  it('运行中的互斥冲突返回稳定 409', async () => {
    mocks.poolQuery.mockResolvedValueOnce([[{ role: 'root', del_flag: 0 }]]);
    mocks.startRun.mockRejectedValueOnce(Object.assign(new Error('busy'), { code: 'RUN_ALREADY_ACTIVE' }));
    const res = response();
    await handle.startRun({ user: { id: 'root-1', role: 'root' }, body: { repeat: 1 } }, res);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
  });
});
