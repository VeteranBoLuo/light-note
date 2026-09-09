import { describe, expect, it, vi } from 'vitest';
import { validateDailyBriefInput } from '../aiSkill/skills/routineDailyBriefSkill.js';
import {
  dailyBriefServiceInternals,
  ensureDailyBrief,
  getDailyBrief,
  refreshDailyBrief,
  updateDailyBriefPreference,
} from './dailyBriefService.js';

const allowActiveUserDispatch = async (_database, _userId, callback) => callback();

describe('dailyBriefService', () => {
  it('关联来源仅由服务端附加，标题中的占位符字样不会被二次解释', () => {
    const fact = {
      id: 'resource_connection',
      count: 1,
      samples: ['《{{todo_due_today.count}}》与旧资料同属装修'],
      sources: [{ type: 'note', id: 'n', title: '{{todo_due_today.count}}' }],
      tagName: '装修',
      route: '/tag/t',
    };
    const brief = dailyBriefServiceInternals.buildBrief({ date: '2026-09-05', locale: 'zh-CN' }, [fact], {
      headline: '新旧资料可对照',
      insights: [
        { factIds: ['resource_connection'], text: '{{resource_connection.sample}}', sources: [{ id: 'forged' }] },
      ],
      recommendation: '打开原资料核对。',
    });
    expect(brief.insights[0].sources).toEqual(fact.sources);
    expect(brief.insights[0].text).toContain('{{todo_due_today.count}}');
    const state = dailyBriefServiceInternals.rowStatus({
      featureEnabled: true,
      preference: { enabled: true },
      calendar: { date: '2026-09-05' },
      row: { status: 'ready', briefJson: brief },
    });
    expect(state.brief.insights[0].text).toBe(brief.insights[0].text);
  });
  it('自动更新偏好验证布尔值且旧客户端缺省字段不覆盖，写入限定当前账号', async () => {
    const database = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await expect(updateDailyBriefPreference(database, 'user-1', true, 'false')).rejects.toMatchObject({
      code: 'DAILY_BRIEF_PREFERENCE_INVALID',
    });
    expect(database.query).not.toHaveBeenCalled();
    await updateDailyBriefPreference(database, 'user-1', true, false);
    expect(database.query.mock.calls[0][0]).toContain("'$.dailyBriefAutoUpdate', CAST(? AS JSON)");
    expect(database.query.mock.calls[0][1]).toEqual(['true', 'false', 'user-1']);
    await updateDailyBriefPreference(database, 'user-1', false);
    expect(database.query.mock.calls[1][0]).not.toContain('$.dailyBriefAutoUpdate');
    expect(database.query.mock.calls[1][1]).toEqual(['false', 'user-1']);
  });

  it('按账号时区返回下一自然日边界，供持续打开的工作台跨天自动确保简报', () => {
    const calendar = dailyBriefServiceInternals.resolveCalendar(
      { timezone: 'Asia/Shanghai', locale: 'zh-CN' },
      new Date('2026-09-04T01:23:45.000Z'),
    );

    expect(calendar).toMatchObject({
      date: '2026-09-04',
      nextDateAt: '2026-09-04T16:00:00Z',
    });
  });

  it('旧版固定模板产物会被映射为待重新生成，避免继续展示为 AI 简报', () => {
    expect(
      dailyBriefServiceInternals.rowStatus({
        featureEnabled: true,
        preference: { enabled: true },
        calendar: { date: '2026-09-04' },
        row: {
          status: 'ready',
          briefJson: JSON.stringify({ version: 1, headline: '旧简报' }),
          generatedAt: '2026-09-04 08:00:00',
        },
      }),
    ).toMatchObject({ status: 'not_generated', brief: null, generatedAt: null });
  });

  it('AI 洞察中的数量和代表标题只由服务端权威事实回填', () => {
    const brief = dailyBriefServiceInternals.buildBrief(
      { date: '2026-09-04', locale: 'zh-CN' },
      [
        {
          id: 'todo_due_today',
          label: '今天待办',
          count: 2,
          route: '/inbox?tab=todo',
          samples: ['季度复盘'],
        },
      ],
      {
        headline: '先把明确事项推进',
        insights: [
          {
            factIds: ['todo_due_today'],
            text: '今天有 {{todo_due_today.count}} 项待办，先处理“{{todo_due_today.sample}}”。',
          },
        ],
        recommendation: '先完成时间边界最清晰的事项。',
      },
    );
    expect(brief).toMatchObject({
      version: 2,
      generatedBy: 'ai',
      insights: [{ text: '今天有 2 项待办，先处理“季度复盘”。' }],
    });
  });

  it('读取已存储的 AI 简报时也会回填标题和建议中的事实占位符', () => {
    const result = dailyBriefServiceInternals.rowStatus({
      featureEnabled: true,
      preference: { enabled: true },
      calendar: { date: '2026-09-04' },
      row: {
        status: 'ready',
        briefJson: JSON.stringify({
          version: 2,
          headline: '还有 {{organize_untagged.count}} 条内容值得整理',
          insights: [
            {
              id: 'insight_1',
              factIds: ['organize_untagged'],
              text: '先从 {{organize_untagged.count}} 条无标签内容开始。',
            },
          ],
          recommendation: '今天先整理“{{organize_untagged.sample}}”。',
          sections: [
            {
              id: 'organize',
              items: [{ id: 'organize_untagged', count: 188, samples: ['旧项目资料'] }],
            },
          ],
        }),
        generatedAt: '2026-09-04 08:00:00',
      },
    });

    expect(result.brief).toMatchObject({
      headline: '还有 188 条内容值得整理',
      insights: [{ text: '先从 188 条无标签内容开始。' }],
      recommendation: '今天先整理“旧项目资料”。',
    });
    expect(JSON.stringify(result.brief)).not.toContain('{{');
  });

  it('偏好默认开启，GET 只读且未生成时返回 not_generated', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ preferences: '{}' }]])
        .mockResolvedValueOnce([[]]),
    };
    await expect(
      getDailyBrief(database, { userId: 'user-1', now: new Date('2026-09-04T01:00:00.000Z') }),
    ).resolves.toMatchObject({ featureEnabled: true, enabled: true, date: '2026-09-04', status: 'not_generated' });
    expect(database.query).toHaveBeenCalledTimes(2);
  });

  it('GET 只读映射过期生成租约为可重试失败态', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ preferences: '{}' }]])
        .mockResolvedValueOnce([
          [
            {
              id: 'brief-1',
              status: 'generating',
              briefJson: null,
              generatedAt: null,
              lastErrorCode: null,
              leaseExpired: 1,
            },
          ],
        ]),
    };

    await expect(
      getDailyBrief(database, { userId: 'user-1', now: new Date('2026-09-04T01:00:00.000Z') }),
    ).resolves.toMatchObject({
      status: 'failed',
      lastErrorCode: 'DAILY_BRIEF_GENERATION_STALE',
      brief: null,
    });
    expect(database.query).toHaveBeenCalledTimes(2);
    expect(database.query.mock.calls[1][0]).toContain('lease_expires_at IS NULL OR lease_expires_at < NOW()');
  });

  it('用户关闭或发布开关关闭时 POST 零 Provider 调用', async () => {
    const executeAiSkill = vi.fn();
    const compileFacts = vi.fn();
    const disabledByPreference = { query: vi.fn().mockResolvedValue([[{ preferences: '{"dailyBrief":false}' }]]) };
    await expect(
      ensureDailyBrief(disabledByPreference, { userId: 'user-1', req: {}, env: {} }, { executeAiSkill, compileFacts }),
    ).resolves.toMatchObject({ enabled: false, status: 'disabled' });

    const disabledByRelease = { query: vi.fn().mockResolvedValue([[{ preferences: '{}' }]]) };
    await expect(
      ensureDailyBrief(
        disabledByRelease,
        { userId: 'user-1', req: {}, env: { AI_DAILY_BRIEF_ENABLED: 'false' } },
        { executeAiSkill, compileFacts },
      ),
    ).resolves.toMatchObject({ featureEnabled: false, status: 'disabled' });
    expect(compileFacts).not.toHaveBeenCalled();
    expect(executeAiSkill).not.toHaveBeenCalled();
  });

  it('同一账号同一天重复 ensure 只生成一次，并按账号语言生成叙述', async () => {
    const facts = [
      ['todo_overdue', 'Overdue todos'],
      ['todo_due_today', "Today's todos"],
      ['bookmark_created_yesterday', 'Bookmarks added yesterday'],
      ['note_created_yesterday', 'Notes added yesterday'],
      ['file_created_yesterday', 'Files added yesterday'],
      ['bookmark_created_today', 'Bookmarks added today'],
      ['note_created_today', 'Notes added today'],
      ['file_created_today', 'Files added today'],
      ['organize_untagged', 'Untagged content to organize'],
      ['organize_ai_pending', 'AI suggestions to review'],
    ].map(([id, label], count) => ({ id, label, count, route: '/workbench' }));
    let inserted = false;
    let storedRow = null;
    const database = {
      query: vi.fn(async (sql, params = []) => {
        if (sql.startsWith('SELECT preferences')) return [[{ preferences: '{"dailyBrief":true,"lang":"en-US"}' }]];
        if (sql.includes('INSERT IGNORE INTO workbench_daily_briefs')) {
          if (inserted) return [{ affectedRows: 0 }];
          inserted = true;
          return [{ affectedRows: 1 }];
        }
        if (sql.includes("SET status = 'generating'")) return [{ affectedRows: 0 }];
        if (sql.includes("SET status = 'ready'")) {
          storedRow = {
            id: 'brief-1',
            status: 'ready',
            briefJson: params[0],
            generatedAt: '2026-09-04 09:00:00',
            lastErrorCode: null,
          };
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('FROM workbench_daily_briefs')) return [[storedRow]];
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };
    const compileFacts = vi.fn().mockResolvedValue(facts);
    const executeAiSkill = vi.fn(async (request, _req, dependencies) => {
      // 跨越 Service 与 internal-only Skill 的真实输入校验器，防止字段漂移。
      validateDailyBriefInput(request.input);
      const response = {
        result: {
          headline: 'Focus on what matters',
          insights: [
            {
              factIds: ['todo_due_today'],
              text: 'There are {{todo_due_today.count}} items due today.',
            },
          ],
          recommendation: 'Handle urgent work before organizing notes',
        },
      };
      await dependencies.commitValidatedResult({ response });
      return response;
    });
    const options = { userId: 'user-1', req: {}, now: new Date('2026-09-04T01:00:00.000Z') };

    const dispatchGuard = vi.fn(async (_database, _userId, callback) => callback());
    const dependencies = {
      compileFacts,
      executeAiSkill,
      withActiveUserAiDispatch: dispatchGuard,
    };
    const first = await ensureDailyBrief(database, options, dependencies);
    const second = await ensureDailyBrief(database, options, dependencies);

    expect(first).toMatchObject({
      status: 'ready',
      brief: {
        version: 2,
        generatedBy: 'ai',
        headline: 'Focus on what matters',
        insights: [{ text: 'There are 1 items due today.' }],
      },
    });
    expect(second).toMatchObject({ status: 'ready', brief: first.brief });
    expect(executeAiSkill).toHaveBeenCalledTimes(1);
    expect(dispatchGuard).toHaveBeenCalledTimes(2);
    expect(dispatchGuard).toHaveBeenNthCalledWith(1, database, 'user-1', expect.any(Function));
    expect(executeAiSkill.mock.calls[0][0]).toMatchObject({
      input: { locale: 'en-US', facts },
      client: { locale: 'en-US' },
    });
    expect(database.query.mock.calls.some(([sql]) => sql.includes('lease_expires_at IS NULL'))).toBe(true);
  });

  it('用户手动更新会重新读取事实并以新的 AI 产物替换当天简报', async () => {
    const facts = [
      'todo_overdue',
      'todo_due_today',
      'bookmark_created_yesterday',
      'note_created_yesterday',
      'file_created_yesterday',
      'organize_untagged',
      'organize_ai_pending',
    ].map((id, index) => ({ id, label: id, count: index, route: '/workbench' }));
    let storedRow = {
      id: 'brief-1',
      status: 'ready',
      briefJson: JSON.stringify({ version: 2, headline: '旧简报', insights: [], sections: [] }),
      generatedAt: '2026-09-04 08:00:00',
      lastErrorCode: null,
    };
    const database = {
      query: vi.fn(async (sql, params = []) => {
        if (sql.startsWith('SELECT preferences')) return [[{ preferences: '{}' }]];
        if (sql.includes("status IN ('ready', 'failed')")) {
          storedRow = { ...storedRow, status: 'generating' };
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('INSERT IGNORE INTO workbench_daily_briefs')) return [{ affectedRows: 0 }];
        if (sql.includes("SET status = 'ready'")) {
          storedRow = {
            ...storedRow,
            status: 'ready',
            briefJson: params[0],
            generatedAt: '2026-09-04 09:00:00',
          };
          return [{ affectedRows: 1 }];
        }
        if (sql.includes('FROM workbench_daily_briefs')) return [[storedRow]];
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };
    const compileFacts = vi.fn().mockResolvedValue(facts);
    const executeAiSkill = vi.fn(async (_request, _req, dependencies) => {
      const response = {
        result: {
          headline: '新的重点',
          insights: [{ factIds: ['todo_due_today'], text: '今天有 {{todo_due_today.count}} 项待办。' }],
          recommendation: '先完成最明确的一项。',
        },
      };
      await dependencies.commitValidatedResult({ response });
      return response;
    });

    const result = await refreshDailyBrief(
      database,
      { userId: 'user-1', req: {}, now: new Date('2026-09-04T01:00:00.000Z') },
      { compileFacts, executeAiSkill, withActiveUserAiDispatch: allowActiveUserDispatch },
    );

    expect(result).toMatchObject({
      status: 'ready',
      brief: { generatedBy: 'ai', headline: '新的重点', insights: [{ text: '今天有 1 项待办。' }] },
    });
    expect(compileFacts).toHaveBeenCalledTimes(2);
    expect(executeAiSkill).toHaveBeenCalledTimes(1);
    expect(database.query.mock.calls.some(([sql]) => sql.includes("status IN ('ready', 'failed')"))).toBe(true);
    expect(JSON.parse(storedRow.briefJson)).toMatchObject({ headline: '新的重点' });
  });

  it('手动更新遇到未过期生成租约时复用当前状态，不并发访问 Provider', async () => {
    const previousBrief = {
      version: 2,
      generatedBy: 'ai',
      headline: '上一版简报',
      insights: [],
      recommendation: '继续当前节奏',
      sections: [],
    };
    const database = {
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT preferences')) return [[{ preferences: '{}' }]];
        if (sql.includes("status IN ('ready', 'failed')")) return [{ affectedRows: 0 }];
        if (sql.includes('INSERT IGNORE INTO workbench_daily_briefs')) return [{ affectedRows: 0 }];
        if (sql.includes('FROM workbench_daily_briefs')) {
          return [
            [
              {
                id: 'brief-1',
                status: 'generating',
                briefJson: JSON.stringify(previousBrief),
                generatedAt: '2026-09-04 08:00:00',
                lastErrorCode: null,
                leaseExpired: 0,
              },
            ],
          ];
        }
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };
    const executeAiSkill = vi.fn();

    await expect(
      refreshDailyBrief(
        database,
        { userId: 'user-1', req: {}, now: new Date('2026-09-04T01:00:00.000Z') },
        {
          compileFacts: async () => [],
          executeAiSkill,
          withActiveUserAiDispatch: allowActiveUserDispatch,
        },
      ),
    ).resolves.toMatchObject({ status: 'generating', brief: { headline: '上一版简报' } });
    expect(executeAiSkill).not.toHaveBeenCalled();
  });

  it('产物围栏写入失败不形成成功交付，过期租约可重领且最终只写入一份', async () => {
    const facts = [
      'todo_overdue',
      'todo_due_today',
      'bookmark_created_yesterday',
      'note_created_yesterday',
      'file_created_yesterday',
      'organize_untagged',
      'organize_ai_pending',
    ].map((id, index) => ({ id, label: id, count: index === 1 ? 1 : 0, route: '/workbench' }));
    let insertAttempts = 0;
    let claimAttempts = 0;
    let deliveryAttempts = 0;
    let committedBrief = null;
    const database = {
      query: vi.fn(async (sql, params = []) => {
        if (sql.startsWith('SELECT preferences')) return [[{ preferences: '{}' }]];
        if (sql.includes('INSERT IGNORE INTO workbench_daily_briefs')) {
          insertAttempts += 1;
          return [{ affectedRows: insertAttempts === 1 ? 1 : 0 }];
        }
        if (sql.includes("SET status = 'generating'")) {
          claimAttempts += 1;
          return [{ affectedRows: 1 }];
        }
        if (sql.includes("SET status = 'ready'")) {
          deliveryAttempts += 1;
          if (deliveryAttempts === 1) return [{ affectedRows: 0 }];
          committedBrief = JSON.parse(params[0]);
          return [{ affectedRows: 1 }];
        }
        if (sql.includes("SET status = 'failed'")) return [{ affectedRows: 0 }];
        if (sql.includes('FROM workbench_daily_briefs'))
          return insertAttempts ? [[{ status: 'generating', leaseExpired: 1 }]] : [[]];
        throw new Error(`unexpected sql: ${sql}`);
      }),
    };
    const executeAiSkill = vi.fn(async (_request, _req, dependencies) => {
      const response = {
        result: {
          headline: 'Today',
          insights: [
            {
              factIds: ['todo_due_today'],
              text: 'There are {{todo_due_today.count}} items due today.',
            },
          ],
          recommendation: 'Do the due item first',
        },
      };
      await dependencies.commitValidatedResult({ response });
      return response;
    });
    const options = { userId: 'user-1', req: {}, now: new Date('2026-09-04T01:00:00.000Z') };

    await expect(
      ensureDailyBrief(database, options, {
        compileFacts: async () => facts,
        executeAiSkill,
        withActiveUserAiDispatch: allowActiveUserDispatch,
      }),
    ).rejects.toMatchObject({ code: 'DAILY_BRIEF_LEASE_LOST', status: 409 });
    await expect(
      ensureDailyBrief(database, options, {
        compileFacts: async () => facts,
        executeAiSkill,
        withActiveUserAiDispatch: allowActiveUserDispatch,
      }),
    ).resolves.toMatchObject({ status: 'ready', brief: { headline: 'Today' } });

    expect(executeAiSkill).toHaveBeenCalledTimes(2);
    expect(claimAttempts).toBe(1);
    expect(deliveryAttempts).toBe(2);
    expect(committedBrief).toMatchObject({ date: '2026-09-04', version: 2, headline: 'Today' });
  });

  it('事实查询参数化且覆盖今天、昨天、待办成员版本与共享无标签口径', async () => {
    const database = { query: vi.fn(async () => [[{ total: 6, sample: '季度复盘', revision: '123:456' }]]) };
    const calendar = dailyBriefServiceInternals.resolveCalendar(
      { timezone: 'Asia/Shanghai', locale: 'zh-CN' },
      new Date('2026-09-04T01:23:45.000Z'),
    );
    const facts = await dailyBriefServiceInternals.compileFacts(database, 'user-1', calendar);
    for (const [sql, params] of database.query.mock.calls) {
      expect(sql.replace(/'[^']*'/g, '').match(/\?/g) || []).toHaveLength(params.length);
      expect(params).toContain('user-1');
      expect(sql).not.toMatch(/SELECT (?:content|body)/);
    }
    const [todoSql, todoParams] = database.query.mock.calls[0];
    expect(todoParams[2]).toBe('2026-09-04');
    expect(todoSql).toContain('id, title, due_at, occurrence_date');
    expect(facts).toHaveLength(14);
    expect(facts.find((fact) => fact.id === 'note_created_today')).toMatchObject({ count: 6, revision: '123:456' });
    const [inventorySql] = database.query.mock.calls.find(([sql]) => sql.includes('organize_issue_suppressions'));
    expect(inventorySql).toContain("SELECT 'file' AS resource_type");
    expect(inventorySql).toContain("suppression.issue_type = 'untagged.ignore'");
    expect(facts.filter((fact) => fact.id.startsWith('todo_')).map((fact) => fact.route)).toEqual([
      '/inbox?tab=todo',
      '/inbox?tab=todo',
    ]);
  });
});

describe('workshop due fallback',()=>{
 it('keeps a factual today reminder when the model omits it, with at most two workshop insights',()=>{
  const facts=['workshop_due','workshop_next_step','workshop_result'].map((id,i)=>({id,count:1,urgency:i===0?'today':undefined,samples:['项目 · 今天到期'],sources:[{type:'research_workspace',id:`p${i}`,title:'项目'}]}));
  const brief=dailyBriefServiceInternals.buildBrief({date:'2026-09-09',locale:'zh-CN'},facts,{headline:'H',recommendation:'R',insights:[{factIds:['workshop_result'],text:'成果'},{factIds:['workshop_next_step'],text:'下一步'}]});
  expect(brief.insights).toHaveLength(2);expect(brief.insights[0]).toMatchObject({factIds:['workshop_due'],text:'项目 · 今天到期',sources:facts[0].sources});
 });
});
