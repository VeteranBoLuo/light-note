import { describe, expect, it, vi } from 'vitest';
import { ensureDailyBrief, getDailyBrief, refreshDailyBrief } from './dailyBriefService.js';
import { DAILY_BRIEF_FACT_DEFINITIONS } from './dailyBriefFacts.js';
import { DAILY_BRIEF_REFRESH_POLICY } from './dailyBriefFreshness.js';
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
      if (sql.includes('SELECT id FROM toolbox_jobs')) return [params.slice(1).filter(id => dismissed.has(id)).map(id => ({id}))];
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
          insights: [{ factIds: ['workshop_result'], text: '{{workshop_result.sample}}' }],
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

describe('今日简报的自动维护', () => {
  it('旧缓存补齐零新增状态，新增和待办完成后在单一概览中切换', async () => {
    const f = fixture();
    await f.ensure();
    for (const type of ['bookmark', 'note', 'file']) f.change(`${type}_created_today`, { count: 0, samples: [] });
    expect(await f.get()).toMatchObject({ stale: true, shouldGenerate: true });
    expect((await f.ensure()).brief.headline).toBe('今天暂无新增资源');
    f.change('file_created_today', { count: 1 });
    expect((await f.ensure()).brief.headline).toBe('今天新增 1 个文件');
    f.change('file_created_today', { count: 0 });
    f.change('todo_due_today', { count: 0, entries: [] });
    expect((await f.ensure()).brief).toMatchObject({
      headline: '今天暂无新增资源，也没有需要特别关注的事项。',
      insights: [],
      recommendation: '',
    });
    expect(f.executeAiSkill).not.toHaveBeenCalled();
  });
  it('旧缓存补回被成果遮蔽的失败，解决后移除；前后均复用成果概括', async () => {
    const f = fixture();
    f.addResult();
    f.change('workshop_attention', {
      count: 1,
      samples: ['工坊成果保存失败：资料摘要'],
      sources: [{ type: 'toolbox_task', id: 'failed-job', title: '资料摘要' }],
      revision: 'failed',
    });
    const initial = await f.ensure();
    const row = f.rows.get('2026-09-05');
    const cached = JSON.parse(row.briefJson);
    cached.snapshot.fingerprint = 'before-independent-failure';
    cached.insights = cached.insights.filter((item) => item.id !== 'workshop_attention');
    cached.recommendation = '';
    row.briefJson = JSON.stringify(cached);
    expect(await f.get()).toMatchObject({ stale: true, shouldGenerate: true });
    const updated = await f.ensure();
    expect(updated.brief.insights.map((item) => item.id)).toEqual(['workshop_attention', 'todo_a', 'workshop_result']);
    expect(updated.brief.insights.find((item) => item.id === 'workshop_result')).toEqual(
      initial.brief.insights.find((item) => item.id === 'workshop_result'),
    );
    expect(updated.brief.recommendationFactIds).toBeUndefined();
    f.change('workshop_attention', { count: 0, samples: [], sources: [], revision: '' });
    expect(await f.get()).toMatchObject({ stale: true, staleFactIds: ['workshop_attention'] });
    const resolved = await f.ensure();
    expect(resolved.brief.insights.map((item) => item.id)).toEqual(['todo_a', 'workshop_result']);
    expect(resolved.brief.recommendation).toBe('');
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
  });
  it('旧简报补回今日新增，只有行动状态时不拼接建议', async () => {
    const f = fixture();
    const before = await f.ensure();
    f.change('file_created_today', { count: 1, samples: [] });
    f.change('organize_ai_pending', { count: 3 });
    expect(await f.get()).toMatchObject({ stale: true, shouldGenerate: true, brief: before.brief });
    const updated = await f.ensure();
    expect(updated.brief.headline).toBe('今天新增 1 个文件，仍有整理建议待审核');
    expect(updated.brief.recommendationKind).toBeUndefined();
    expect(updated.brief.recommendationFactIds).toBeUndefined();
    f.change('file_created_today', { count: 0 });
    f.change('organize_ai_pending', { count: 0 });
    const resolved = await f.ensure();
    expect(resolved.brief).toMatchObject({ headline: '', recommendation: '' });
    expect(resolved.brief.sections.some((section) => section.id === 'new_content')).toBe(false);
    expect(resolved.brief.insights).toHaveLength(1);
    expect(f.executeAiSkill).not.toHaveBeenCalled();
  });
  it('旧展示版本补齐成果状态，复用原有概括且不重复调用模型', async () => {
    const f = fixture();
    f.addResult();
    await f.ensure();
    const row = f.rows.get('2026-09-05');
    const cached = JSON.parse(row.briefJson);
    cached.snapshot.fingerprint = 'previous-presentation-version';
    delete cached.insights.find((item) => item.id === 'workshop_result').context;
    row.briefJson = JSON.stringify(cached);
    expect(await f.get()).toMatchObject({ stale: true, shouldGenerate: true });
    const updated = await f.ensure();
    const result = updated.brief.insights.find((item) => item.id === 'workshop_result');
    expect(result.context).toBe('《报告》已生成，尚未保存。');
    expect(result.text).toBe(cached.insights.find((item) => item.id === 'workshop_result').text);
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
  });
  it('检查只读；并发生成单次待办简报，不调用模型、不占用自动模型预算', async () => {
    const f = fixture();
    expect(await f.get()).toMatchObject({ status: 'not_generated', shouldGenerate: true });
    expect(f.rows.size).toBe(0);
    await Promise.all([f.ensure(), f.ensure(), f.ensure()]);
    const state = await f.get();
    expect(state).toMatchObject({
      status: 'ready',
      stale: false,
      shouldGenerate: false,
      brief: { generatedBy: 'facts', recommendation: '' },
    });
    expect(state.brief.insights).toHaveLength(1);
    expect(state.brief.insights[0]).toMatchObject({
      text: '「报销材料」需要在今天 15:00 前完成，目前仍待处理。',
      sources: [{ type: 'todo', id: 'a' }],
    });
    expect(f.executeAiSkill).not.toHaveBeenCalled();
    expect(JSON.parse(f.rows.get('2026-09-05').factsJson).automaticAttempts).toBe(0);
  });
  it('单次待办完成后立即更新为空，不受模型冷却或旧额度错误影响', async () => {
    const f = fixture();
    await f.ensure();
    f.rows.get('2026-09-05').lastErrorCode = 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST';
    f.change('todo_due_today', { count: 0, entries: [] });
    expect(await f.get()).toMatchObject({ stale: true, shouldGenerate: true });
    const state = await f.ensure();
    expect(state).toMatchObject({
      stale: false,
      brief: { headline: '今天暂无需特别关注的事项', insights: [], recommendation: '' },
    });
    expect(f.executeAiSkill).not.toHaveBeenCalled();
  });
  it('旧版只有待办的缓存可补回资源与较早整理建议，处理完成后及时移除，不调用模型', async () => {
    const f = fixture();
    await f.ensure();
    const row = f.rows.get('2026-09-05');
    const cached = JSON.parse(row.briefJson);
    delete cached.snapshot.factRevisions.organize_pending;
    delete cached.snapshot.factRevisions.organize_untagged;
    row.briefJson = JSON.stringify(cached);
    f.change('organize_pending', { count: 4 });
    f.change('organize_untagged', { count: 510 });
    f.change('organize_ai_pending', { count: 3, recent: false });
    expect(await f.get()).toMatchObject({ stale: true, shouldGenerate: true });
    const state = await f.ensure();
    expect(state.brief.insights.map((item) => item.id)).toEqual(['todo_a', 'organize_summary']);
    f.change('organize_pending', { count: 0 });
    f.change('organize_untagged', { count: 0 });
    f.change('organize_ai_pending', { count: 0 });
    expect((await f.ensure()).brief.insights.map((item) => item.id)).toEqual(['todo_a']);
    expect(f.executeAiSkill).not.toHaveBeenCalled();
  });
  it('同数量对象编辑或替换立即刷新，保留之前快照直至围栏交付', async () => {
    const f = fixture();
    const before = await f.ensure();
    f.change('todo_due_today', {
      revision: 'b',
      entries: [{ id: 'new', title: '更新后的任务', at: '2026-09-05 19:00', reason: 'due' }],
    });
    expect(await f.get()).toMatchObject({ stale: true, staleFactIds: ['todo_due_today'], brief: before.brief });
    expect(await f.ensure()).toMatchObject({
      stale: false,
      brief: { insights: [{ text: '「更新后的任务」需要在今天 19:00 前完成，目前仍待处理。' }] },
    });
  });
  it('自动关闭保持手动入口，总开关关闭不读取事实或生成', async () => {
    const f = fixture();
    f.preferences.dailyBriefAutoUpdate = false;
    expect(await f.ensure()).toMatchObject({ pauseReason: 'manual', shouldGenerate: false });
    expect(await f.refresh()).toMatchObject({ status: 'ready' });
    const count = f.deps.compileFacts.mock.calls.length;
    f.preferences.dailyBrief = false;
    expect(await f.refresh()).toMatchObject({ status: 'disabled' });
    expect(f.deps.compileFacts).toHaveBeenCalledTimes(count);
  });
  it('模型只收到有结论的新成果；待办变化复用成果概括，不重复调用模型', async () => {
    const f = fixture();
    f.addResult();
    await f.ensure();
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
    expect(f.executeAiSkill.mock.calls[0][0]).toMatchObject({
      skillVersion: 2,
      input: { locale: 'zh-CN', facts: [{ id: 'workshop_result' }] },
    });
    expect(f.executeAiSkill.mock.calls[0][0].input.facts).toHaveLength(1);
    f.advance(20 * 60_000);
    f.change('todo_due_today', { count: 0, entries: [] });
    const state = await f.ensure();
    expect(state.brief.insights).toHaveLength(1);
    expect(state.brief.insights[0].text).toContain('资料未完整读取');
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
  });
  it.each(['PROVIDER_FAILED', 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST', 'AI_SKILL_DAILY_BRIEF_OUTPUT_INVALID'])(
    '模型失败 %s 不挡住真实行动与原成果结论',
    async (code) => {
      const f = fixture();
      f.addResult();
      f.executeAiSkill.mockRejectedValueOnce(Object.assign(new Error('mock'), { code }));
      const state = await f.ensure();
      expect(state).toMatchObject({ status: 'ready', brief: { generatedBy: 'facts', recommendation: '' } });
      expect(state.brief.insights).toHaveLength(2);
      expect(state.brief.insights[1].text).toContain('资料未完整读取');
      await f.ensure();
      expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
    },
  );
  it('模型预算耗尽仍交付新行动事实，跨账号自然日不沿用预算', async () => {
    const f = fixture();
    await f.ensure();
    const row = f.rows.get('2026-09-05');
    row.factsJson = JSON.stringify({
      ...JSON.parse(row.factsJson),
      automaticAttempts: DAILY_BRIEF_REFRESH_POLICY.maxAutomaticAttempts,
    });
    f.addResult();
    f.change('todo_due_today', { count: 0, entries: [] });
    expect(await f.ensure()).toMatchObject({ status: 'ready', brief: { generatedBy: 'facts' } });
    expect(f.executeAiSkill).not.toHaveBeenCalled();
    f.advance(24 * 60 * 60_000);
    f.change('workshop_result', { revision: 'new-day-result' });
    await f.ensure();
    expect(f.rows.size).toBe(2);
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
  });
  it('同一成果跨天仍复用概括，不因日期切换再次消耗额度', async () => {
    const f = fixture();
    f.addResult();
    await f.ensure();
    f.advance(24 * 60 * 60_000);
    await f.ensure();
    expect(f.rows.size).toBe(2);
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
  });
  it('持久化结果未知时不通过降级再写一次', async () => {
    const f = fixture();
    f.addResult();
    const query = f.database.query.getMockImplementation();
    f.database.query.mockImplementation(async (sql, params) => {
      if (sql.includes("SET status = 'ready'"))
        throw Object.assign(new Error('database failure'), { code: 'ECONNRESET' });
      return query(sql, params);
    });
    await expect(f.ensure()).rejects.toMatchObject({ code: 'ECONNRESET' });
    expect(f.database.query.mock.calls.filter(([sql]) => sql.includes("SET status = 'ready'"))).toHaveLength(1);
  });
  it('模型等待期间发生变化，交付保留真实截止时间并标为待更新', async () => {
    const f = fixture();
    f.addResult();
    const original = f.executeAiSkill.getMockImplementation();
    f.executeAiSkill.mockImplementationOnce(async (...args) => {
      f.change('todo_due_today', { count: 0, entries: [] });
      await original(...args);
    });
    expect(await f.ensure()).toMatchObject({
      status: 'ready',
      stale: true,
      dataAsOf: '2026-09-05T02:00:00.000Z',
      brief: { insights: [{ id: 'todo_a' }, { id: 'workshop_result' }] },
    });
  });
  it('围栏交付失败不会降级覆盖另一个租约的产物', async () => {
    const f = fixture();
    f.addResult();
    const original = f.executeAiSkill.getMockImplementation();
    f.executeAiSkill.mockImplementationOnce(async (...args) => {
      f.rows.get('2026-09-05').leaseToken = 'other';
      await original(...args);
    });
    await expect(f.ensure()).rejects.toMatchObject({ code: 'DAILY_BRIEF_LEASE_LOST' });
    expect(f.rows.get('2026-09-05').briefJson).toBeUndefined();
  });
  it('未过期租约不重复编译，过期租约通过写入口恢复', async () => {
    const f = fixture();
    f.rows.set('2026-09-05', { status: 'generating', leaseExpired: 0 });
    expect(await f.ensure()).toMatchObject({ status: 'generating' });
    expect(f.deps.compileFacts).not.toHaveBeenCalled();
    f.rows.get('2026-09-05').leaseExpired = 1;
    expect(await f.get()).toMatchObject({ status: 'failed', shouldGenerate: true });
    expect(await f.ensure()).toMatchObject({ status: 'ready' });
  });
});

describe('真实资料建议的生成与复用', () => {
  const evidence = [
    {
      key: 'material_1',
      title: '导出方案',
      excerpt: '离线导出目前只保存正文，不包含附件；导出页面需要说明附件备份方式。',
      source: { type: 'note', id: 'owned', title: '导出方案' },
    },
  ];
  const proposal = {
    sourceKey: 'material_1',
    quote: '离线导出目前只保存正文，不包含附件',
    action: '可以将附件备份检查加入导出验收清单，并核对导出页面是否清楚说明这一限制。',
  };
  for (const recommendation of [proposal, null])
    it(`真实材料支持独立建议，${recommendation ? '有效' : '空'}判断跨刷新与跨日复用，改内容才重算`, async () => {
      const f = fixture();
      f.change('recommendation_evidence', { evidence });
      f.executeAiSkill.mockImplementation(async (request, _req, deps) => {
        validateDailyBriefInput(request.input);
        expect(request.input.facts).toEqual([]);
        expect(request.input.evidence[0]).not.toHaveProperty('source');
        await deps.commitValidatedResult({ response: { result: { insights: [], recommendation } } });
      });
      const first = await f.ensure();
      expect(Boolean(first.brief.recommendation)).toBe(Boolean(recommendation));
      expect(first.brief.adviceKey).toBeTruthy();
      f.change('file_created_today', { count: 1 });
      await f.ensure();
      await f.refresh();
      expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
      f.advance(24 * 60 * 60 * 1000);
      await f.ensure();
      expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
      f.change('recommendation_evidence', {
        evidence: [{ ...evidence[0], excerpt: evidence[0].excerpt + '补充新的验收背景。' }],
      });
      expect(await f.get()).toMatchObject({ stale: true, staleFactIds: ['recommendation_evidence'] });
      await f.ensure();
      expect(f.executeAiSkill).toHaveBeenCalledTimes(2);
      f.change('recommendation_evidence', { evidence: [] });
      expect((await f.ensure()).brief.recommendation).toBe('');
      expect(f.executeAiSkill).toHaveBeenCalledTimes(2);
    });
  it('材料变化使旧建议退出当前判断，等待与失败保留上次展示结果', async () => {
    const f = fixture();
    f.change('recommendation_evidence', { evidence });
    f.executeAiSkill.mockImplementation(async (_request, _req, deps) =>
      deps.commitValidatedResult({ response: { result: { insights: [], recommendation: proposal } } }),
    );
    await f.ensure();
    f.change('recommendation_evidence', {
      evidence: [{ ...evidence[0], excerpt: '新资料内容与之前完全不同，不能沿用旧导出限制的处理建议。' }],
    });
    const waiting = await f.ensure();
    expect(waiting.brief.recommendation).toBe('');
    expect(waiting.brief.lastAdviceResult.recommendation).toContain(proposal.action);
    expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
    f.advance(11 * 60000);
    expect(await f.get()).toMatchObject({ shouldGenerate: true });
    f.executeAiSkill.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 'PROVIDER_FAILED' }));
    const state = await f.ensure();
    expect(state.status).toBe('ready');
    expect(state.brief.recommendation).toBe('');
    expect(state.brief.lastAdviceResult.recommendation).toContain(proposal.action);
    expect(state.brief.insights.map((item) => item.id)).toContain('todo_a');
    expect((await f.get()).shouldGenerate).toBe(false); // Provider 失败不自动重放
  });
});

it('建议失败明确标记，自动检查不重复调用；冷却后手动重试可恢复为空建议', async () => {
  const f = fixture();
  f.change('recommendation_evidence', {
    evidence: [
      {
        key: 'material_1',
        title: '资料',
        excerpt: '导出目前只包含正文，附件需要单独备份，请核对导出页面的提示说明。',
        source: { type: 'note', id: 'note', title: '资料' },
      },
    ],
  });
  f.executeAiSkill.mockRejectedValue(
    Object.assign(new Error('invalid output'), { code: 'AI_SKILL_DAILY_BRIEF_OUTPUT_INVALID' }),
  );
  expect((await f.ensure()).brief.adviceStatus).toBe('failed');
  expect((await f.get()).shouldGenerate).toBe(false);
  await f.refresh();
  expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
  f.advance(31000);
  f.executeAiSkill.mockImplementation(async (_request, _req, deps) =>
    deps.commitValidatedResult({ response: { result: { insights: [], recommendation: null } } }),
  );
  const state = await f.refresh();
  expect(state.brief.adviceStatus).toBe('no_value');
  expect(state.brief.adviceKey).toBeTruthy();
  expect(state.brief.recommendation).toBe('');
  expect(f.executeAiSkill).toHaveBeenCalledTimes(2);
});

const retryEvidence = [
  {
    key: 'material_1',
    title: '导出方案',
    excerpt: '导出目前只包含正文，附件需要单独备份，请核对导出页面的提示说明。',
    source: { type: 'note', id: 'note', title: '导出方案' },
  },
];

it.each(['PROVIDER_FAILED', 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST', 'AI_QUOTA_EXCEEDED'])(
  '失败 %s 经普通事实刷新、冷却、跨日仍保留，不自动重放；手动重试才恢复',
  async (code) => {
    const f = fixture();
    f.change('recommendation_evidence', { evidence: retryEvidence });
    f.executeAiSkill.mockRejectedValue(Object.assign(new Error('failed'), { code }));
    const first = await f.ensure();
    expect(first.brief.adviceStatus).toBe('failed');
    const failureKey = first.brief.adviceAttemptKey;
    for (const duration of [1000, 11 * 60000, 24 * 60 * 60000]) {
      f.advance(duration);
      f.change('file_created_today', { count: duration });
      const state = await f.ensure();
      expect(state.brief).toMatchObject({ adviceStatus: 'failed', adviceAttemptKey: failureKey });
      expect(state.brief.adviceDeferred).toBeUndefined();
      expect((await f.get()).shouldGenerate).toBe(false);
      expect(f.executeAiSkill).toHaveBeenCalledTimes(1);
    }
    f.executeAiSkill.mockImplementation(async (_request, _req, deps) =>
      deps.commitValidatedResult({ response: { result: { insights: [], recommendation: null } } }),
    );
    const recovered = await f.refresh();
    expect(recovered.brief.adviceStatus).toBe('no_value');
    expect(recovered.brief.adviceFailureCode).toBeUndefined();
    expect(f.executeAiSkill).toHaveBeenCalledTimes(2);
  },
);

it('漏返回建议判断视为失败，不写入空建议缓存', async () => {
  const f = fixture();
  f.change('recommendation_evidence', { evidence: retryEvidence });
  f.executeAiSkill.mockImplementation(async (_request, _req, deps) =>
    deps.commitValidatedResult({ response: { result: { insights: [] } } }),
  );
  const state = await f.ensure();
  expect(state.brief).toMatchObject({ adviceStatus: 'failed', adviceFailureReason: 'ADVICE_DECISION_MISSING' });
  expect(state.brief.adviceKey).toBeUndefined();
});

it('无可读材料、冷却等待和明确无价值有不同状态', async () => {
  const f = fixture();
  expect((await f.ensure()).brief.adviceStatus).toBe('no_evidence');
  f.change('recommendation_evidence', { evidence: retryEvidence });
  f.executeAiSkill.mockImplementation(async (_request, _req, deps) =>
    deps.commitValidatedResult({ response: { result: { insights: [], recommendation: null } } }),
  );
  expect((await f.ensure()).brief.adviceStatus).toBe('no_value');
  f.change('recommendation_evidence', {
    evidence: [{ ...retryEvidence[0], excerpt: retryEvidence[0].excerpt + '新资料。' }],
  });
  const deferred = await f.ensure();
  expect(deferred.brief.adviceStatus).toBe('deferred');
  expect(deferred.brief.lastAdviceResult).toMatchObject({ adviceStatus: 'no_value', recommendation: '' });
  expect((await f.get()).brief.lastAdviceResult).toEqual(deferred.brief.lastAdviceResult);
  f.advance(11 * 60000);
  expect((await f.ensure()).brief.adviceStatus).toBe('no_value');
});

it('交付后的事实复核失败，不标为已确认最新', async () => {
  const f = fixture();
  const original = f.deps.compileFacts.getMockImplementation();
  f.deps.compileFacts.mockImplementationOnce(original).mockRejectedValueOnce(new Error('read failed'));
  const state = await f.ensure();
  expect(state.status).toBe('ready');
  expect(state.stale).toBe(true);
  expect(state.checkedAt).toBeNull();
  expect(state.staleFactIds).toContain('todo_due_today');
});

it('更新失败保存上次完成结果，后续重试完成替换结果', async () => {
  const f = fixture();
  f.change('recommendation_evidence', { evidence: retryEvidence });
  f.executeAiSkill.mockImplementation(async (_request, _req, deps) =>
    deps.commitValidatedResult({ response: { result: { insights: [], recommendation: null } } }),
  );
  expect((await f.ensure()).brief.lastAdviceResult.adviceStatus).toBe('no_value');
  f.change('recommendation_evidence', {
    evidence: [{ ...retryEvidence[0], excerpt: retryEvidence[0].excerpt + '新版。' }],
  });
  f.advance(11 * 60000);
  f.executeAiSkill.mockRejectedValue(new Error('provider unavailable'));
  const failed = await f.ensure();
  expect(failed.brief.adviceStatus).toBe('failed');
  expect(failed.brief.lastAdviceResult).toMatchObject({ adviceStatus: 'no_value', recommendation: '' });
  expect((await f.get()).brief.lastAdviceResult).toEqual(failed.brief.lastAdviceResult);
});

it.each([false, true])('旧等待记录自动恢复，无需手动刷新，Provider 失败=%s', async (providerFailed) => {
  const f = fixture();
  f.change('recommendation_evidence', { evidence: retryEvidence });
  f.executeAiSkill.mockImplementation(async (_request, _req, deps) =>
    deps.commitValidatedResult({ response: { result: { insights: [], recommendation: null } } }),
  );
  await f.ensure();
  const row = f.rows.get('2026-09-05');
  const legacy = JSON.parse(row.briefJson);
  delete legacy.lastAdviceResult;
  delete legacy.adviceResultVersion;
  delete legacy.adviceKey;
  delete legacy.adviceProposal;
  legacy.adviceStatus = 'deferred';
  legacy.adviceDeferred = true;
  row.briefJson = JSON.stringify(legacy);
  expect((await f.get()).shouldGenerate).toBe(false);
  f.advance(31000);
  expect((await f.get()).shouldGenerate).toBe(true);
  if (providerFailed) f.executeAiSkill.mockRejectedValue(new Error('provider unavailable'));
  const restored = await f.ensure();
  expect(restored.brief.adviceStatus).toBe(providerFailed ? 'failed' : 'no_value');
  expect(restored.brief.adviceResultVersion).toBe(1);
  expect(restored.brief.lastAdviceResult?.adviceStatus).toBe(providerFailed ? undefined : 'no_value');
  // 重新创建调用依赖、仅从持久化行读取，结果不依赖服务进程内存。
  const reloaded = await getDailyBrief(
    f.database,
    { userId: 'user-1', now: new Date('2026-09-05T02:01:00Z'), req: {}, check: true },
    { ...f.deps },
  );
  expect(reloaded.brief.adviceStatus).toBe(restored.brief.adviceStatus);
  f.advance(11 * 60000);
  await f.ensure();
  expect(f.executeAiSkill).toHaveBeenCalledTimes(2);
});

it('移除提醒后过滤已生成简报，即使自动更新关闭也不调用模型或写缓存', async () => {
  const f = fixture();
  f.change('workshop_attention', { count: 1, samples: ['工坊任务处理失败：旧任务'], sources: [{type:'toolbox_task',id:'old-failure',title:'旧任务'}], revision:'failed' });
  const generated = await f.ensure();
  expect(generated.brief.insights.some(item => item.id==='workshop_attention')).toBe(true);
  const stored = f.rows.get('2026-09-05').briefJson;
  f.preferences.dailyBriefAutoUpdate = false; f.dismissed.add('old-failure');
  f.database.query.mockClear();
  const response = await f.get();
  expect(response.brief.insights.some(item => item.id==='workshop_attention')).toBe(false);
  expect(f.executeAiSkill).not.toHaveBeenCalled();
  expect(f.rows.get('2026-09-05').briefJson).toBe(stored);
  expect(f.database.query.mock.calls.every(([sql]) => !/INSERT|UPDATE /u.test(sql))).toBe(true);
});
