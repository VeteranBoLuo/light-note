import { describe, expect, it, vi } from 'vitest';
import { ensureDailyBrief, getDailyBrief, refreshDailyBrief } from './dailyBriefService.js';
import { DAILY_BRIEF_FACT_DEFINITIONS } from './dailyBriefFacts.js';
import { DAILY_BRIEF_REFRESH_POLICY } from './dailyBriefFreshness.js';
import { validateDailyBriefInput } from '../aiSkill/skills/routineDailyBriefSkill.js';

function fixture() {
  const rows = new Map();
  const preferences = { lang: 'zh-CN', timezone: 'Asia/Shanghai', dailyBrief: true, dailyBriefAutoUpdate: true };
  let facts = DAILY_BRIEF_FACT_DEFINITIONS.map(([id, label, , route]) => ({
    id,
    label,
    route,
    count: 2,
    samples: [],
    revision: 'a',
  }));
  let now = new Date('2026-09-05T02:00:00Z');
  const options = () => ({ userId: 'user-1', req: {}, now });
  const database = {
    query: vi.fn(async (sql, params) => {
      if (sql.startsWith('SELECT preferences')) return [[{ preferences }]];
      if (sql.includes('brief_date < ?')) {
        const priorDate = [...rows.keys()]
          .filter((date) => date < params[1] && rows.get(date).briefJson)
          .sort()
          .at(-1);
        return [priorDate ? [structuredClone(rows.get(priorDate))] : []];
      }
      if (sql.includes('FROM workbench_daily_briefs')) {
        const row = rows.get(params[1]);
        return [row ? [structuredClone(row)] : []];
      }
      if (sql.includes('INSERT IGNORE')) {
        if (rows.has(params[2])) return [{ affectedRows: 0 }];
        rows.set(params[2], { status: 'generating', factsJson: params[4], leaseToken: params[5] });
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("SET status = 'generating'")) {
        const row = rows.get(params[5]);
        if (!row || (row.status === 'generating' && !row.leaseExpired)) return [{ affectedRows: 0 }];
        Object.assign(row, { status: 'generating', factsJson: params[0], leaseToken: params[2], leaseExpired: 0 });
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("SET status = 'ready'")) {
        const row = rows.get(params[2]);
        if (!row || row.leaseToken !== params[3]) return [{ affectedRows: 0 }];
        Object.assign(row, {
          status: 'ready',
          briefJson: params[0],
          generatedAt: now.toISOString(),
          lastErrorCode: null,
        });
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("SET status = 'failed'")) {
        const row = rows.get(params[2]);
        if (row?.leaseToken === params[3]) Object.assign(row, { status: 'failed', lastErrorCode: params[0] });
        return [{ affectedRows: 1 }];
      }
      throw new Error(`Unhandled test query: ${sql}`);
    }),
  };
  const compileFacts = vi.fn(async () => structuredClone(facts));
  const executeAiSkill = vi.fn(async (request, _req, deps) => {
    validateDailyBriefInput(request.input);
    expect(request.input.facts.some((fact) => 'revision' in fact)).toBe(false);
    await deps.commitValidatedResult({
      response: {
        result: {
          headline: '当前工作重点',
          insights: [{ factIds: ['todo_due_today'], text: '今天有 {{todo_due_today.count}} 项待办。' }],
          recommendation: '先推进当前待办',
        },
      },
    });
  });
  let queue = Promise.resolve();
  const withActiveUserAiDispatch = (_db, _user, callback) => {
    const next = queue.then(callback);
    queue = next.catch(() => {});
    return next;
  };
  const deps = { compileFacts, executeAiSkill, withActiveUserAiDispatch };
  return {
    database,
    deps,
    rows,
    preferences,
    executeAiSkill,
    advance: (ms) => {
      now = new Date(now.getTime() + ms);
    },
    change: (id, values) => {
      facts = facts.map((fact) => (fact.id === id ? { ...fact, ...values } : fact));
    },
    get: () => getDailyBrief(database, { ...options(), check: true }, deps),
    ensure: () => ensureDailyBrief(database, options(), deps),
    refresh: () => refreshDailyBrief(database, options(), deps),
  };
}

describe('今日简报的自动维护', () => {
  it('跨天生成新简报仍识别旧积压未变，不重复把它当作新进展', async () => {
    const f = fixture();
    await f.ensure();
    expect(f.executeAiSkill.mock.calls[0][0].input.unchangedFactIds).toEqual([]);
    f.advance(24 * 60 * 60_000);
    f.change('note_created_today', { count: 3, revision: 'new' });
    await f.ensure();
    const input = f.executeAiSkill.mock.calls[1][0].input;
    expect(input.date).toBe('2026-09-06');
    expect(input.unchangedFactIds).toContain('organize_untagged');
    expect(input.unchangedFactIds).not.toContain('note_created_today');
    expect(f.rows.size).toBe(2);
  });
  it('检查是只读；首次缺失自动生成，无变化的并发 ensure/手动更新均不重复调用 AI', async () => {
    const f = fixture();
    expect(await f.get()).toMatchObject({ status: 'not_generated', shouldGenerate: true });
    expect(f.rows.size).toBe(0);
    await Promise.all([f.ensure(), f.ensure(), f.ensure()]);
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
    f.advance(20 * 60_000);
    expect(await f.get()).toMatchObject({ stale: false, shouldGenerate: false });
    await f.refresh();
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
  });

  it('同数量对象变化也会变旧，普通变化合并至十分钟；更新前绝不替换原文数字', async () => {
    const f = fixture();
    await f.ensure();
    f.advance(120_000);
    f.change('note_created_today', { revision: 'new-object' });
    const pending = await f.get();
    expect(pending).toMatchObject({ stale: true, staleFactIds: ['note_created_today'], shouldGenerate: false });
    expect(pending.nextRefreshAt).toBe('2026-09-05T02:10:00.000Z');
    await f.ensure();
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
    f.advance(8 * 60_000);
    expect(await f.ensure()).toMatchObject({ status: 'ready', stale: false });
    expect(f.executeAiSkill).toHaveBeenCalledTimes(2);
  });

  it('待办完成和治理队列减少优先更新，但连续操作仍有短冷却', async () => {
    const f = fixture();
    await f.ensure();
    f.change('todo_due_today', { count: 0 });
    expect(await f.get()).toMatchObject({
      stale: true,
      shouldGenerate: false,
      brief: { insights: [{ text: '今天有 2 项待办。' }] },
    });
    f.advance(60_000);
    expect(await f.ensure()).toMatchObject({ brief: { insights: [{ text: '今天有 0 项待办。' }] } });
    f.change('organize_ai_pending', { count: 0 });
    f.advance(60_000);
    expect(await f.get()).toMatchObject({ shouldGenerate: true });
  });

  it('关闭自动更新后仍可手动生成；总功能关闭则两条入口都不生成', async () => {
    const f = fixture();
    f.preferences.dailyBriefAutoUpdate = false;
    expect(await f.ensure()).toMatchObject({ pauseReason: 'manual', shouldGenerate: false });
    expect(f.executeAiSkill).not.toHaveBeenCalled();
    expect(await f.refresh()).toMatchObject({ status: 'ready' });
    f.preferences.dailyBrief = false;
    expect(await f.refresh()).toMatchObject({ status: 'disabled' });
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
  });

  it('手动更新可绕过普通冷却，但不能在三十秒内重复生成', async () => {
    const f = fixture();
    await f.ensure();
    f.change('file_created_today', { count: 4 });
    await f.refresh();
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
    f.advance(30_000);
    expect(await f.refresh()).toMatchObject({ stale: false });
    expect(f.executeAiSkill).toHaveBeenCalledTimes(2);
  });

  it('失败保留旧正文、持久化退避；额度不足暂停自动重试但允许用户主动重试', async () => {
    const f = fixture();
    const before = await f.ensure();
    f.change('note_created_today', { count: 8 });
    f.advance(10 * 60_000);
    f.executeAiSkill.mockRejectedValueOnce(
      Object.assign(new Error('mock provider failure'), { code: 'PROVIDER_FAILED' }),
    );
    await expect(f.ensure()).rejects.toMatchObject({ code: 'PROVIDER_FAILED' });
    expect(await f.get()).toMatchObject({ status: 'failed', brief: before.brief, stale: true, shouldGenerate: false });
    f.advance(15 * 60_000);
    f.executeAiSkill.mockRejectedValueOnce(
      Object.assign(new Error('mock quota'), { code: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST' }),
    );
    await expect(f.ensure()).rejects.toMatchObject({ code: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST' });
    f.advance(60 * 60_000);
    expect(await f.ensure()).toMatchObject({ pauseReason: 'quota', shouldGenerate: false });
    expect(await f.refresh()).toMatchObject({ status: 'ready', pauseReason: null });
  });

  it('自动尝试预算跨标签页共享，手动仍可更新，新账号自然日重置预算', async () => {
    const f = fixture();
    await f.ensure();
    const row = f.rows.get('2026-09-05');
    const attempt = JSON.parse(row.factsJson);
    row.factsJson = JSON.stringify({ ...attempt, automaticAttempts: DAILY_BRIEF_REFRESH_POLICY.maxAutomaticAttempts });
    f.change('file_created_today', { count: 5 });
    f.advance(60 * 60_000);
    expect(await f.ensure()).toMatchObject({ pauseReason: 'budget', shouldGenerate: false });
    expect(await f.refresh()).toMatchObject({ status: 'ready' });
    expect(JSON.parse(row.factsJson).automaticAttempts).toBe(DAILY_BRIEF_REFRESH_POLICY.maxAutomaticAttempts);
    f.advance(24 * 60 * 60_000);
    expect(await f.ensure()).toMatchObject({ status: 'ready', date: '2026-09-06' });
    expect(JSON.parse(f.rows.get('2026-09-06').factsJson).automaticAttempts).toBe(1);
  });

  it('生成期间资料再变化，交付的是已注明截至时间的旧快照而不是伪实时内容', async () => {
    const f = fixture();
    const original = f.executeAiSkill.getMockImplementation();
    f.executeAiSkill.mockImplementationOnce(async (...args) => {
      f.change('todo_due_today', { count: 0 });
      await original(...args);
    });
    expect(await f.ensure()).toMatchObject({
      status: 'ready',
      stale: true,
      dataAsOf: '2026-09-05T02:00:00.000Z',
      brief: { insights: [{ text: '今天有 2 项待办。' }] },
    });
  });

  it('过期生成租约可自动恢复，不会永远卡在生成中', async () => {
    const f = fixture();
    f.rows.set('2026-09-05', { status: 'generating', leaseExpired: 1 });
    expect(await f.get()).toMatchObject({ shouldGenerate: true, status: 'failed' });
    expect(await f.ensure()).toMatchObject({ status: 'ready' });
  });
});
