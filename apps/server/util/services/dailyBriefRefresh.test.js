import { describe, expect, it, vi } from 'vitest';
import { ensureDailyBrief, getDailyBrief, refreshDailyBrief } from './dailyBriefService.js';
import { DAILY_BRIEF_FACT_DEFINITIONS } from './dailyBriefFacts.js';
import { DAILY_BRIEF_REFRESH_POLICY } from './dailyBriefFreshness.js';
import { MIN_SAFE_ADVICE_POLICY_VERSION } from './dailyBriefAdvice.js';
import { validateDailyBriefInput } from '../aiSkill/skills/routineDailyBriefSkill.js';

function fixture() {
  const rows = new Map();
  const dismissed = new Set();
  const preferences = { lang: 'zh-CN', timezone: 'Asia/Shanghai', dailyBrief: true, dailyBriefAutoUpdate: true };
  let facts = DAILY_BRIEF_FACT_DEFINITIONS.map(([id, label, , route]) => ({
    id,
    label,
    route,
    count: id === 'todo_due_today' ? 2 : 0,
    samples: [],
    entries:
      id === 'todo_due_today'
        ? [
            { id: 'a', title: '报销材料', at: '2026-09-05 15:00', reason: 'due' },
            { id: 'b', title: '提交方案', at: '2026-09-05 18:00', reason: 'due' },
          ]
        : [],
    revision: 'a',
  }));
  let now = new Date('2026-09-05T02:00:00Z');
  const options = () => ({ userId: 'user-1', req: {}, now });
  const database = {
    query: vi.fn(async (sql, params) => {
      if (sql.includes('SELECT id FROM toolbox_jobs'))
        return [
          params
            .slice(1)
            .filter((id) => dismissed.has(id))
            .map((id) => ({ id })),
        ];
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
    expect(request.input).not.toHaveProperty('evidence');
    await deps.commitValidatedResult({
      response: {
        result: {
          insights: [],
          recommendation: null,
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
    dismissed,
    deps,
    rows,
    addResult: () => {
      facts = [
        ...facts.filter((f) => f.id !== 'workshop_result'),
        {
          id: 'workshop_result',
          label: '新成果',
          route: '/toolbox/task/result',
          count: 1,
          samples: ['资料未完整读取：这是从指定资料中得到的结论，应结合原成果核对后使用。'],
          sources: [{ type: 'toolbox_task', id: 'result', title: '报告' }],
          revision: 'result-1',
        },
      ];
    },
    preferences,
    executeAiSkill,
    advance: (ms) => {
      now = new Date(now.getTime() + ms);
    },
    change: (id, values) => {
      facts = facts.some((fact) => fact.id === id)
        ? facts.map((fact) => (fact.id === id ? { ...fact, ...values } : fact))
        : [...facts, { id, ...values }];
    },
    get: () => getDailyBrief(database, { ...options(), check: true }, deps),
    ensure: () => ensureDailyBrief(database, options(), deps),
    refresh: () => refreshDailyBrief(database, options(), deps),
  };
}

describe('工作台行动建议的生成与复用', () => {
  it('没有需要行动的状态时仅交付事实，不调用模型', async () => {
    const f = fixture();
    f.change('todo_due_today', { count: 0, entries: [] });
    expect((await f.ensure()).brief.adviceStatus).toBe('no_evidence');
    expect(f.executeAiSkill).not.toHaveBeenCalled();
  });
  it('待办、整理、新增和工坊进入同一次判断，没有正文与隐藏详情查询', async () => {
    const f = fixture();
    f.change('organize_pending', { count: 7, resources: [{ title: '随便写的反馈', content: '不能外发' }] });
    f.change('file_created_today', { count: 2 });
    f.addResult();
    f.executeAiSkill.mockImplementation(async (request, _req, deps) => {
      validateDailyBriefInput(request.input);
      expect(request.input.signals.map((s) => s.id)).toEqual(
        expect.arrayContaining(['todo_due_today', 'organize_pending', 'file_created_today', 'workshop_result']),
      );
      expect(JSON.stringify(request.input)).not.toMatch(/不能外发|随便写|资料未完整读取|excerpt|evidence/);
      await deps.commitValidatedResult({
        response: {
          result: {
            insights: [],
            recommendation: {
              factIds: ['todo_due_today', 'workshop_result'],
              action: '先完成今天到期的待办，再查看并保存工坊已经生成的成果。',
            },
          },
        },
      });
    });
    const state = await f.ensure();
    expect(state.brief.adviceStatus).toBe('ready');
    expect(state.brief.recommendationSources).toHaveLength(2);
    await f.get();
    await f.ensure();
    await f.refresh();
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
  });
  it('明确空判断也缓存；资源内容变化不重复调用，状态变化才重新判断', async () => {
    const f = fixture();
    f.change('organize_pending', { count: 3, resources: [{ title: '随笔' }] });
    await f.ensure();
    f.change('organize_pending', { resources: [{ title: '随便写的别的东西' }] });
    await f.ensure();
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
    f.change('organize_pending', { count: 4 });
    const wait = await f.ensure();
    expect(wait.brief.adviceStatus).toBe('deferred');
    expect(wait.brief.lastAdviceResult.adviceStatus).toBe('no_value');
    f.advance(11 * 60000);
    await f.ensure();
    expect(f.executeAiSkill).toHaveBeenCalledTimes(2);
  });
  it('查询保持只读；自动关闭仍检查事实并保留明确待判断状态', async () => {
    const f = fixture();
    await f.ensure();
    f.preferences.dailyBriefAutoUpdate = false;
    f.change('organize_pending', { count: 3 });
    f.database.query.mockClear();
    const state = await f.get();
    expect(state.shouldGenerate).toBe(false);
    expect(state.stale).toBe(true);
    expect(f.database.query.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
    await f.ensure();
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
  });
  it('并发请求在同一账号生命周期屏障内合并，缓存判断不重复计费', async () => {
    const f = fixture();
    await Promise.all([f.ensure(), f.ensure(), f.refresh()]);
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
  });
  it.each(['PROVIDER_FAILED', 'AI_QUOTA_EXCEEDED', 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST'])(
    '失败保留状态，普通检查不自动重放：%s',
    async (code) => {
      const f = fixture();
      f.executeAiSkill.mockRejectedValue(Object.assign(new Error('unavailable'), { code }));
      expect((await f.ensure()).brief.adviceStatus).toBe('failed');
      f.advance(20 * 60000);
      await f.ensure();
      await f.get();
      expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
      f.executeAiSkill.mockImplementation(async (_r, _q, d) =>
        d.commitValidatedResult({ response: { result: { insights: [], recommendation: null } } }),
      );
      expect((await f.refresh()).brief.adviceStatus).toBe('no_value');
      expect(f.executeAiSkill).toHaveBeenCalledTimes(2);
    },
  );
  it('模型漏掉判断不能当作无建议，持久化失败不能降级成成功', async () => {
    const f = fixture();
    f.executeAiSkill.mockImplementation(async (_r, _q, d) =>
      d.commitValidatedResult({ response: { result: { insights: [] } } }),
    );
    expect((await f.ensure()).brief).toMatchObject({
      adviceStatus: 'failed',
      adviceFailureReason: 'ADVICE_DECISION_MISSING',
    });
    const broken = fixture();
    broken.executeAiSkill.mockResolvedValue({ result: { recommendation: null } });
    await expect(broken.ensure()).rejects.toMatchObject({ code: 'DAILY_BRIEF_DELIVERY_NOT_COMMITTED' });
  });
  it('内容建议旧缓存不能作为上次行动建议继续展示，读取不改写历史', async () => {
    const f = fixture();
    await f.ensure();
    const row = f.rows.get('2026-09-05');
    const old = JSON.parse(row.briefJson);
    old.recommendation = '旧的资料内容建议';
    old.adviceStatus = 'ready';
    old.advicePolicyVersion = MIN_SAFE_ADVICE_POLICY_VERSION - 1;
    old.lastAdviceResult = {
      recommendation: old.recommendation,
      adviceStatus: 'ready',
      advicePolicyVersion: old.advicePolicyVersion,
    };
    row.briefJson = JSON.stringify(old);
    const before = row.briefJson;
    f.preferences.dailyBriefAutoUpdate = false;
    const state = await f.get();
    expect(state.brief.recommendation).toBe('');
    expect(state.brief.lastAdviceResult).toBeUndefined();
    expect(row.briefJson).toBe(before);
  });
  it('正常上次行动建议在新状态等待与失败期间保留', async () => {
    const f = fixture();
    const action = '先完成今天到期的待办，再安排没有明确时限的其他整理。';
    f.executeAiSkill.mockImplementation(async (_r, _q, d) =>
      d.commitValidatedResult({
        response: { result: { insights: [], recommendation: { factIds: ['todo_due_today'], action } } },
      }),
    );
    await f.ensure();
    f.change('organize_pending', { count: 8 });
    expect((await f.ensure()).brief.lastAdviceResult.recommendation).toBe(action);
    f.advance(11 * 60000);
    f.executeAiSkill.mockRejectedValue(new Error('unavailable'));
    expect((await f.ensure()).brief.lastAdviceResult.recommendation).toBe(action);
  });
  it('移除工坊提醒后旧简报立即隐藏，读路径不调用模型', async () => {
    const f = fixture();
    f.change('workshop_attention', {
      count: 1,
      samples: ['失败'],
      sources: [{ type: 'toolbox_task', id: 'failed', title: '任务' }],
    });
    await f.ensure();
    f.dismissed.add('failed');
    const state = await f.get();
    expect(state.brief.insights.some((i) => i.id === 'workshop_attention')).toBe(false);
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
  });
  it('租约丢失和数据库交付异常不能写成空判断或成功', async () => {
    const f = fixture();
    const original = f.database.query;
    f.database.query = vi.fn(async (sql, params) =>
      sql.includes("SET status = 'ready'") ? [{ affectedRows: 0 }] : original(sql, params),
    );
    await expect(f.ensure()).rejects.toMatchObject({ code: 'DAILY_BRIEF_LEASE_LOST' });
  });
  it('自动判断沿用每日次数与冷却上限，达到预算后不继续调用', async () => {
    const f = fixture();
    for (let index = 0; index < DAILY_BRIEF_REFRESH_POLICY.maxAutomaticAttempts; index++) {
      f.change('organize_pending', { count: index + 1 });
      await f.ensure();
      f.advance(11 * 60000);
    }
    expect(f.executeAiSkill).toHaveBeenCalledTimes(24);
    f.change('organize_pending', { count: 100 });
    const stopped = await f.ensure();
    expect(stopped.brief.adviceStatus).toBe('paused');
    expect(f.executeAiSkill).toHaveBeenCalledTimes(24);
  });
  it('移除提醒时同时清除基于该任务的行动建议和上次建议，等待期间不能复活', async () => {
    const f = fixture();
    f.change('workshop_attention', {
      count: 1,
      samples: ['失败'],
      sources: [{ type: 'toolbox_task', id: 'failed', title: '任务' }],
    });
    f.executeAiSkill.mockImplementation(async (_r, _q, d) =>
      d.commitValidatedResult({
        response: {
          result: {
            insights: [],
            recommendation: {
              factIds: ['workshop_attention'],
              action: '先查看失败任务的状态与原资料，再决定后续如何处理。',
            },
          },
        },
      }),
    );
    await f.ensure();
    f.dismissed.add('failed');
    expect((await f.get()).brief.recommendation).toBe('');
    f.change('workshop_attention', { count: 0, samples: [], sources: [] });
    const state = await f.ensure();
    expect(state.brief.lastAdviceResult?.recommendation).toBeFalsy();
  });
});
