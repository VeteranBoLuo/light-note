import { describe, it, expect, vi } from 'vitest';
import { normalizeCoreUsageOptions, generateCoreUsageReport } from './coreUsageReport.js';
const options = { asOf: '2026-10-10T12:00:00+08:00', storageOffset: '+08:00' };
describe('核心使用报告参数', () => {
  it.each([
    { days: 91 },
    { days: 6 },
    { days: 1.5 },
    { storageOffset: '+14:01' },
    { storageOffset: null },
    { asOf: '2026-02-30T12:00:00+08:00' },
    { asOf: '2026-10-10 12:00:00' },
    { growthCoverageStart: '2027-01-01T00:00:00Z' },
  ])('拒绝非法窗口、时间及覆盖起点 %j', (input) => {
    expect(() => normalizeCoreUsageOptions({ ...options, ...input })).toThrow('CORE_USAGE_INVALID_OPTIONS');
  });
  it('统一时刻，保留未知覆盖', () => {
    const o = normalizeCoreUsageOptions(options);
    expect(new Date(o.asOf).toISOString()).toBe('2026-10-10T04:00:00.000Z');
    expect(o.coverage.growth).toBeNull();
  });
});
function fakeDb({ version = '5.7.44', zone = 480, growthError = null } = {}) {
  let active = 0,
    peak = 0;
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      if (sql.includes('VERSION()')) return [[{ version, utcOffsetMinutes: zone }]];
      if (sql.includes('information_schema'))
        return [
          [
            ...Object.entries({
              user: 'del_flag,create_time,id',
              growth_events: 'user_id,source,status,create_time',
              conversion_events: 'user_id,event,create_time',
              user_activity_daily: 'user_id,activity_date',
            }).map(([tableName, cols]) => ({ tableName, cols })),
          ],
        ];
      if (sql.includes('AS registered')) return [[{ registered: 4, eligible: 3 }]];
      if (sql.includes('AS first_count')) {
        if (growthError) throw growthError;
        return [[{ own_count: 1, first_count: 2, returning_count: 1 }]];
      }
      if (sql.includes('FROM user_activity_metadata')) return [[{ startedAt: '2026-01-01 00:00:00' }]];
      return [[{ own_count: 1, returning_count: 1 }]];
    }),
  };
  return {
    connection,
    getConnection: async () => connection,
    get peak() {
      return peak;
    },
  };
}
describe('报告降级与只读编排', () => {
  it('覆盖未知保留观测人数，不伪造比例，单连接串行提交', async () => {
    const db = fakeDb();
    const r = await generateCoreUsageReport(db, options);
    expect(r.metrics.a7Overall).toMatchObject({ eligible: 3, observed: 2, value: null, status: 'coverage_unknown' });
    expect(r.metrics.r7InteractionProxy.value).toBe(33.33);
    expect(db.peak).toBe(1);
    expect(db.connection.commit).toHaveBeenCalledOnce();
    expect(db.connection.release).toHaveBeenCalledOnce();
    expect(
      db.connection.query.mock.calls.every(([sql]) => sql.startsWith('SELECT /*+ MAX_EXECUTION_TIME(5000) */')),
    ).toBe(true);
  });
  it('超时源单独缺失，不将失败当零，不泄露异常正文', async () => {
    const db = fakeDb({ growthError: { code: 'ER_QUERY_TIMEOUT', message: 'sensitive-query' } });
    const r = await generateCoreUsageReport(db, { ...options, conversionCoverageStart: '2026-01-01T00:00:00Z' });
    expect(r.metrics.a7Overall).toMatchObject({ observed: null, value: null, reasons: ['query_timeout'] });
    expect(r.metrics.a7ResourcesLegacy.value).toBe(33.33);
    expect(JSON.stringify(r)).not.toContain('sensitive-query');
  });
  it('保留窗口不足，即使给出早期覆盖起点也不输出完整比例', async () => {
    const r = await generateCoreUsageReport(fakeDb(), {
      ...options,
      conversionCoverageStart: '2026-01-01T00:00:00Z',
      conversionRetentionDays: 7,
    });
    expect(r.metrics.a7ResourcesLegacy.status).toBe('partial_coverage');
    expect(r.metrics.a7ResourcesLegacy.value).toBeNull();
  });
  it('历史 asOf 不能绕过当前已清理的保留窗口', async () => {
    const r = await generateCoreUsageReport(fakeDb(), {
      ...options,
      asOf: '2020-10-10T12:00:00+08:00',
      conversionCoverageStart: '2020-01-01T00:00:00Z',
    });
    expect(r.metrics.a7ResourcesLegacy.status).toBe('partial_coverage');
    expect(r.metrics.a7ResourcesLegacy.value).toBeNull();
  });
  it.each([{ version: '10.11.0-MariaDB' }, { zone: 0 }])('不支持的引擎或不匹配时区在聚合前停止 %j', async (input) => {
    const db = fakeDb(input);
    await expect(generateCoreUsageReport(db, options)).rejects.toThrow(/CORE_USAGE_/);
    expect(db.connection.beginTransaction).not.toHaveBeenCalled();
    expect(db.connection.release).toHaveBeenCalledOnce();
  });
});
