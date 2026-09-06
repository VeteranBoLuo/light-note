import { describe, expect, it, vi } from 'vitest';
import { readGroupedUsage, mapGroupedUsage } from './aiUsageGroups.js';
import { getUserAiUsage, normalizeAiUsageQuery, mapAiUsageExecution } from './aiUsageService.js';
import { readFileSync } from 'node:fs';
const id = 'f780a4a3-cc81-4c5d-9bad-010004040404';
const row = {
  id: 'execution',
  organize_run_id: id,
  skill_id: 'organize.metadata',
  status: 'success',
  resource_count: 40,
  execution_count: 42,
  provider_call_count: 44,
  charged_tokens: 150,
  provider_tokens: 200,
  usage_complete: 1,
  run_status: 'paused',
};
describe('整次整理用量汇总', () => {
  it('分页前按任务聚合，旧记录按执行独立，调用统计仍保留', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[row]])
        .mockResolvedValueOnce([[{ total: 1 }]]),
    };
    const result = await readGroupedUsage(db, 'actor_user_id=?', ['owner'], 20, 20);
    expect(db.query.mock.calls[0][0]).toMatch(/GROUP BY[\s\S]*LIMIT/);
    expect(db.query.mock.calls[0][0]).toContain('COUNT(DISTINCT organize_item_id)');
    expect(db.query.mock.calls[1][0]).toContain("CONCAT('execution:',id)");
    expect(db.query.mock.calls[0][1]).toEqual(['owner', 'owner', 20, 20]);
    expect(result.total).toBe(1);
    const item = mapGroupedUsage(row, mapAiUsageExecution);
    expect(item).toMatchObject({
      status: 'paused',
      resourceCount: 40,
      executionCount: 42,
      providerCallCount: 44,
      chargedTokens: 150,
      platformCoveredTokens: 50,
    });
  });
  it.each(['running', 'preparing', 'paused', 'ended', 'completed'])('区分任务状态 %s', (status) => {
    const item = mapGroupedUsage({ ...row, run_status: status, status: 'partial' }, mapAiUsageExecution);
    expect(item.status).toBe(
      { running: 'running', preparing: 'running', paused: 'paused', ended: 'aborted', completed: 'partial' }[status],
    );
  });
  it('平台承担按每次调用求和，不与其它调用的扣费相抵', () => {
    expect(mapGroupedUsage({ ...row, platform_covered_tokens: 100 }, mapAiUsageExecution).platformCoveredTokens).toBe(
      100,
    );
  });
  it('旧记录不补造分组或覆盖单次状态', () => {
    const item = mapGroupedUsage({ ...row, organize_run_id: null, status: 'quota_blocked' }, mapAiUsageExecution);
    expect(item.organizeRunId).toBeUndefined();
    expect(item.status).toBe('quota_blocked');
  });
  it('汇总条数与真实模型动作数量互不混淆', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        if (sql.includes('SELECT g.*')) return [[row]];
        if (sql.includes('COUNT(DISTINCT IF')) return [[{ total: 1 }]];
        if (sql.includes('COUNT(*) AS model_actions')) return [[{ model_actions: 42, charged_tokens: 150 }]];
        return [[]];
      }),
    };
    const result = await getUserAiUsage('payer', { groupOrganize: true }, db);
    expect(result.pagination.total).toBe(1);
    expect(result.summary.modelActions).toBe(42);
    expect(result.items[0].resourceCount).toBe(40);
  });
  it('指定任务的分页明细仍按付款者和时间范围限制', async () => {
    const db = { query: vi.fn().mockResolvedValue([[]]) };
    await getUserAiUsage('payer', { organizeRunId: id, groupOrganize: true, days: 30 }, db);
    expect(db.query).toHaveBeenCalledTimes(4);
    for (const [sql, args] of db.query.mock.calls) {
      expect(sql).toContain('actor_user_id = ?');
      expect(sql).toContain('organize_run_id = ?');
      expect(args.slice(0, 3)).toEqual(['payer', 30, id]);
    }
    expect(normalizeAiUsageQuery({ organizeRunId: id, groupOrganize: true }).groupOrganize).toBeUndefined();
    expect(() => normalizeAiUsageQuery({ organizeRunId: "' OR 1=1" })).toThrow();
  });
  it('迁移前退回旧明细，数据库连接失败仍报错', async () => {
    const db = {
      query: vi.fn(async (sql) => {
        if (sql.includes('organize_run_id')) throw Object.assign(new Error(), { code: 'ER_BAD_FIELD_ERROR' });
        return [[{ total: 2 }]];
      }),
    };
    expect((await readGroupedUsage(db, 'actor_user_id=?', ['owner'], 20, 0)).available).toBe(false);
    db.query.mockRejectedValue(Object.assign(new Error('offline'), { code: 'ECONNREFUSED' }));
    await expect(readGroupedUsage(db, 'actor_user_id=?', ['owner'], 20, 0)).rejects.toThrow('offline');
  });
  it('独立迁移只添加关联和索引，不回填或改写历史计费', () => {
    const sql = readFileSync(new URL('../migrations/20260906_organize_usage_groups.sql', import.meta.url), 'utf8');
    expect(sql).toContain('organize_item_id');
    expect(sql).toContain('idx_ai_execution_organize');
    expect(sql).not.toMatch(/UPDATE|DELETE|TRUNCATE/);
  });
});
