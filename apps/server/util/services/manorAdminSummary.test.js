import { describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
import { createManorAdminService } from './manorAdminService.js';

function fixture({ coverage = new Date('2026-10-01T00:00:00+08:00'), failFinances = false, failActivity = false } = {}) {
  const calls = [];
  const conn = {
    query: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM knowledge_manor_runtime')) return [[{ mode: 'open', revision: 1, coverageStartedAt: coverage }]];
      if (sql.includes('FROM points_log')) {
        if (failFinances) throw new Error('unavailable');
        return [[{ day: '2026-11-02', issued: '30', spent: '0' }, { day: '2026-11-03', issued: '200', spent: '300' }]];
      }
      if (sql.includes('COUNT(DISTINCT o.user_id)')) {
        if (failActivity) throw new Error('unavailable');
        return [[{ count: '8' }]];
      }
      return [[]];
    },
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
  };
  const service = createManorAdminService({ db: { getConnection: async () => conn }, now: () => new Date('2026-11-02T16:01:00Z') });
  return { service, calls, conn };
}

describe('总览庄园每日摘要', () => {
  it('按北京时间跨日，返回七个自然日和正确净额，今日活跃只查询当天有效操作', async () => {
    const { service, calls, conn } = fixture();
    const report = await service.summary();
    expect(report).toMatchObject({ day: '2026-11-03', hideInternal: true, activeToday: 8, activityPartialToday: false, failures: [] });
    expect(report.daily).toHaveLength(7);
    expect(report.daily[0]).toEqual({ day: '2026-10-28', issued: 0, spent: 0, net: 0 });
    expect(report.daily.at(-1)).toEqual({ day: '2026-11-03', issued: 200, spent: 300, net: -100 });
    const activity = calls.find(c => c.sql.includes('COUNT(DISTINCT o.user_id)'));
    expect(activity.params.slice(0, 4)).toEqual(['root', 'test', '2026-11-03 00:00:00', '2026-11-04 00:00:00']);
    expect(activity.sql).toContain('o.effectful=1');
    expect(calls.find(c => c.sql.includes('FROM points_log')).params.slice(0, 2)).toEqual(['2026-10-28 00:00:00', '2026-11-04 00:00:00']);
    expect(calls.filter(c => /^SELECT/.test(c.sql))).toHaveLength(3);
    expect(calls.some(c => /^(INSERT|UPDATE|DELETE|CREATE|ALTER)\b/.test(c.sql))).toBe(false);
    expect(conn.commit).toHaveBeenCalledOnce();
    expect(conn.release).toHaveBeenCalledOnce();
  });
  it('内部账号筛选同时作用于积分和活跃，摘要不接受扩大历史范围', async () => {
    const { service, calls } = fixture();
    const report = await service.summary({ hideInternal: 'false', days: 30 });
    expect(report.hideInternal).toBe(false);
    expect(report.daily).toHaveLength(7);
    for (const call of calls.filter(c => /FROM points_log|COUNT\(DISTINCT o.user_id\)/.test(c.sql))) {
      expect(call.sql).not.toContain('NOT IN');
      expect(call.params).not.toContain('root');
      expect(call.params).not.toContain('test');
    }
  });
  it.each([null, new Date('2026-11-04T00:00:00+08:00')])('覆盖起点未知或在未来时人数未知，积分仍可读', async (coverage) => {
    const { service, calls } = fixture({ coverage });
    const report = await service.summary();
    expect(report.activeToday).toBeNull();
    expect(report.daily.at(-1).net).toBe(-100);
    expect(calls.some(c => c.sql.includes('COUNT(DISTINCT o.user_id)'))).toBe(false);
  });
  it('今日中途启用时明确不完整，并从覆盖起点读取', async () => {
    const { service, calls } = fixture({ coverage: new Date('2026-11-03T00:00:30+08:00') });
    expect(await service.summary()).toMatchObject({ activeToday: 8, activityPartialToday: true });
    expect(calls.find(c => c.sql.includes('COUNT(DISTINCT o.user_id)')).params[2]).toBe('2026-11-03 00:00:30');
  });
  it('积分和活跃独立降级，不以零值掩盖来源失败', async () => {
    expect(await fixture({ failFinances: true }).service.summary()).toMatchObject({ daily: null, activeToday: 8, failures: ['finances'] });
    const report = await fixture({ failActivity: true }).service.summary();
    expect(report).toMatchObject({ activeToday: null, failures: ['activity'] });
    expect(report.daily.at(-1).spent).toBe(300);
  });
});
