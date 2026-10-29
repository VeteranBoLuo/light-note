import { beforeEach, describe, it, expect, vi } from 'vitest';
import { ManorError } from '@lightnote/shared/manor';
const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  overview: vi.fn(),
  players: vi.fn(),
  player: vi.fn(),
  operations: vi.fn(),
  updateRuntime: vi.fn(),
}));
vi.mock('../util/services/manorAdminService.js', () => ({ manorAdminService: mocks }));
vi.mock('../db/index.js', () => ({ default: {} }));
vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, msg) => ({ data, status, msg }),
  L: (_req, zh) => zh,
}));
vi.mock('../util/rootRole.js', () => ({
  ensureRootRole: async (req, res) => {
    if (req.user?.role === 'root') return true;
    res.send({ status: 403 });
    return false;
  },
}));
import { getManorAdminStatus, getManorAdminPlayer, updateManorAdminRuntime } from './manorAdminHandle.js';
describe('庄园管理只允许 Root 本人', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status.mockResolvedValue({ mode: 'open' });
  });
  it.each(['user', 'test', 'visitor'])('拒绝 %s 读取或写入管理域', async (role) => {
    const res = { send: vi.fn() };
    const req = { user: { id: 'a', role } };
    await getManorAdminStatus(req, res);
    await updateManorAdminRuntime(req, res);
    expect(res.send).toHaveBeenCalledWith({ status: 403 });
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.updateRuntime).not.toHaveBeenCalled();
  });
  it('代管上下文不能用管理接口切换 owner', async () => {
    const res = { send: vi.fn() };
    await getManorAdminPlayer(
      { user: { id: 'root', role: 'root' }, adminContext: { mode: 'readonly' }, params: { userId: 'a' } },
      res,
    );
    expect(res.send.mock.calls[0][0].status).toBe(403);
    expect(mocks.player).not.toHaveBeenCalled();
  });
  it('部署开关关闭时 Root 仍能读取管理状态，稳定错误不泄露内部信息', async () => {
    const req = { user: { id: 'root', role: 'root' }, params: { userId: 'a' } },
      res = { send: vi.fn() };
    await getManorAdminStatus(req, res);
    expect(res.send.mock.calls[0][0]).toMatchObject({ status: 200, data: { mode: 'open' } });
    mocks.player.mockRejectedValue(new ManorError('MANOR_ADMIN_USER_NOT_FOUND', 404));
    await getManorAdminPlayer(req, res);
    expect(res.send.mock.calls[1][0]).toMatchObject({ status: 404, data: { code: 'MANOR_ADMIN_USER_NOT_FOUND' } });
  });
});

// 服务本身被上方 vi.mock 替换；这里取真实实现，用替身连接验证查询参数与返回结构。
const actual = await vi.importActual('../util/services/manorAdminService.js');
function fakeDb({ earners = [], failEarners = false } = {}) {
  const calls = [];
  const conn = {
    query: vi.fn(async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes('knowledge_manor_runtime'))
        return [[{ mode: 'open', message: '', revision: 3, coverageStartedAt: null }]];
      if (sql.includes('GROUP BY o.user_id')) {
        if (failEarners) throw new Error('timeout');
        return [earners];
      }
      if (sql.includes('knowledge_manors m')) return [[{ count: 2 }]];
      return [[]];
    }),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
  };
  return { db: { getConnection: async () => conn }, calls };
}
const earnerCall = (calls) => calls.find((c) => c.sql.includes('GROUP BY o.user_id'));
describe('庄园后台服务：账号收入与开放范围', () => {
  const now = () => new Date('2026-10-29T02:00:00Z');
  it('净额阈值边界：400 不标记，401 标记偏高；数据库字符串数值转为数字', () => {
    expect(actual.MANOR_EARNER_FLAG_NET).toBe(400);
    expect(
      actual.summarizeManorEarners([
        { userId: 'a', alias: '甲', income: '421', spent: '20', net: '401' },
        { userId: 'b', alias: '乙', income: '400', spent: '0', net: '400' },
        { userId: 'c', alias: null, income: '0', spent: '30', net: '-30' },
      ]),
    ).toEqual([
      { userId: 'a', alias: '甲', income: 421, spent: 20, net: 401, flagged: true },
      { userId: 'b', alias: '乙', income: 400, spent: 0, net: 400, flagged: false },
      { userId: 'c', alias: null, income: 0, spent: 30, net: -30, flagged: false },
    ]);
  });
  it('汇总并入总览：固定滚动 7 天，不跟随 30 天范围，默认排除内部账号，最多 10 个', async () => {
    const { db, calls } = fakeDb({ earners: [{ userId: 'a', alias: '甲', income: 500, spent: 40, net: 460 }] });
    const report = await actual.createManorAdminService({ db, now }).overview({ days: 30 });
    expect(report.range.days).toBe(30);
    expect(report.earners).toEqual({
      windowDays: 7,
      since: '2026-10-22 10:00:00',
      threshold: 400,
      items: [{ userId: 'a', alias: '甲', income: 500, spent: 40, net: 460, flagged: true }],
    });
    expect(report.failures).toEqual([]);
    const call = earnerCall(calls);
    expect(call.sql).toMatch(/o\.created_at>=\?/);
    expect(call.sql).toMatch(/u\.role NOT IN \(\?,\?\)/);
    expect(call.params).toEqual(['2026-10-22 10:00:00', 'root', 'test', 10]);
  });
  it('关闭“排除内部账号”时不再过滤 root/test', async () => {
    const { db, calls } = fakeDb();
    await actual.createManorAdminService({ db, now }).overview({ hideInternal: 'false' });
    const call = earnerCall(calls);
    expect(call.sql).not.toMatch(/NOT IN/);
    expect(call.params).toEqual(['2026-10-22 10:00:00', 10]);
  });
  it('空数据返回空列表；查询失败只记入 failures，不影响其他统计', async () => {
    const empty = fakeDb();
    expect((await actual.createManorAdminService({ db: empty.db, now }).overview()).earners.items).toEqual([]);
    const failing = fakeDb({ failEarners: true });
    const report = await actual.createManorAdminService({ db: failing.db, now }).overview();
    expect(report.earners).toBeNull();
    expect(report.failures).toEqual(['earners']);
    expect(report.opened).toBe(2);
  });
  it('运行状态返回开放范围，未知配置回落到内部账号', async () => {
    const previous = process.env.KNOWLEDGE_MANOR_AUDIENCE;
    try {
      const service = actual.createManorAdminService({ db: fakeDb().db });
      const conn = await fakeDb().db.getConnection();
      process.env.KNOWLEDGE_MANOR_AUDIENCE = 'all';
      expect((await service.status(conn)).audience).toBe('all');
      process.env.KNOWLEDGE_MANOR_AUDIENCE = 'everyone';
      expect((await service.status(conn)).audience).toBe('internal');
      delete process.env.KNOWLEDGE_MANOR_AUDIENCE;
      expect((await service.status(conn)).audience).toBe('internal');
    } finally {
      if (previous === undefined) delete process.env.KNOWLEDGE_MANOR_AUDIENCE;
      else process.env.KNOWLEDGE_MANOR_AUDIENCE = previous;
    }
  });
});
