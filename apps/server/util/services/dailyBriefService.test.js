import { describe, expect, it, vi } from 'vitest';
import { dailyBriefServiceInternals, getDailyBrief, updateDailyBriefPreference } from './dailyBriefService.js';
import { selectDailyBriefFacts } from './dailyBriefFacts.js';
const calendar = { date: '2026-10-22', locale: 'zh-CN', timezone: 'Asia/Shanghai' };
const todo = (values = {}) => ({
  id: 'todo_due_today',
  count: 1,
  entries: [{ id: 'one', title: '提交报销材料', at: '2026-10-22 15:00', reason: 'due' }],
  ...values,
});

describe('今日简报事实交付', () => {
  it('核实零新增后显示状态，平静日合成一句，昨日新增不变成待整理', () => {
    const activity = ['bookmark', 'note', 'file'].map((type) => ({ id: `${type}_created_today`, count: 0 }));
    const facts = [...activity, { id: 'file_created_yesterday', count: 98 }];
    const quiet = dailyBriefServiceInternals.buildBrief(calendar, facts);
    expect(quiet).toMatchObject({
      headline: '今天暂无新增资源，也没有需要特别关注的事项。',
      insights: [],
      recommendation: '',
    });
    expect(quiet.sections.find((section) => section.id === 'new_content').items).toEqual(activity);
    expect(quiet.sections.find((section) => section.id === 'organize').items).toEqual([]);
    expect(dailyBriefServiceInternals.buildBrief(calendar, [...facts, todo()])).toMatchObject({
      headline: '今天暂无新增资源',
      insights: [{ id: 'todo_one' }],
    });
    expect(dailyBriefServiceInternals.buildBrief({ ...calendar, locale: 'en-US' }, facts).headline).toBe(
      'No resources added today, and nothing needs special attention.',
    );
    expect(dailyBriefServiceInternals.buildBrief({ ...calendar, locale: 'en-US' }, [...facts, todo()]).headline).toBe(
      'No resources added today.',
    );
    // 缺少统计证据时不能用零值补齐，更不能声称已经检查过。
    expect(dailyBriefServiceInternals.buildBrief(calendar, [activity[0], todo()]).headline).toBe('');
  });
  it('今日新增只作顶部事实概览，不占重点位置，不生成收藏习惯或昨日回顾', () => {
    const facts = [
      todo(),
      { id: 'bookmark_created_today', count: 2 },
      { id: 'file_created_today', count: 1 },
      { id: 'note_created_today', count: 0 },
      { id: 'file_created_yesterday', count: 98 },
    ];
    const brief = dailyBriefServiceInternals.buildBrief(calendar, facts);
    expect(brief.headline).toBe('今天新增 2 条书签和1 个文件');
    expect(brief.insights).toHaveLength(1);
    expect(brief.sections.find((section) => section.id === 'new_content').items).toEqual(facts.slice(1, 3));
    expect(brief.recommendation).toBe('');
    expect(dailyBriefServiceInternals.buildBrief({ ...calendar, locale: 'en-US' }, facts).headline).toBe(
      'Added today: 2 bookmarks and 1 file',
    );
    const onlyActivity = dailyBriefServiceInternals.buildBrief(calendar, [facts[2]]);
    expect(onlyActivity).toMatchObject({ headline: '今天新增 1 个文件', insights: [], recommendation: '' });
  });
  it('顶部按真实整理状态概括积压，数量仅留在正文，未知新增不伪装成零', () => {
    const zero = ['bookmark', 'note', 'file'].map((type) => ({ id: `${type}_created_today`, count: 0 }));
    for (const id of ['organize_pending', 'organize_untagged', 'organize_ai_pending']) {
      const backlog = { id, count: 3 };
      const suffix = id === 'organize_ai_pending' ? '仍有整理建议待审核' : '仍有资料待整理';
      const empty = dailyBriefServiceInternals.buildBrief(calendar, [...zero, backlog]);
      expect(empty.headline).toBe(`今天暂无新增资源，${suffix}`);
      expect(empty.insights).toHaveLength(1);
      expect(empty.insights[0].text).toContain('3');
      const added = dailyBriefServiceInternals.buildBrief(calendar, [{ id: 'file_created_today', count: 2 }, backlog]);
      expect(added.headline).toBe(`今天新增 2 个文件，${suffix}`);
      expect(dailyBriefServiceInternals.buildBrief(calendar, [backlog]).headline).toBe(suffix);
      const en = dailyBriefServiceInternals.buildBrief({ ...calendar, locale: 'en-US' }, [...zero, backlog]);
      expect(en.headline).toBe(
        `No resources added today; ${id === 'organize_ai_pending' ? 'organizing suggestions await review' : 'resources still await organizing'}`,
      );
    }
    const combined = dailyBriefServiceInternals.buildBrief(calendar, [
      ...zero,
      { id: 'organize_pending', count: 4 },
      { id: 'organize_untagged', count: 510 },
      { id: 'organize_ai_pending', count: 3 },
    ]);
    expect(combined.headline).toBe('今天暂无新增资源，仍有资料待整理');
    expect(combined.insights).toHaveLength(1);
    expect(combined.insights[0].text).toContain('510');
    expect(
      dailyBriefServiceInternals.buildBrief(calendar, [...zero, { id: 'organize_pending', count: 0 }]).headline,
    ).toBe('今天暂无新增资源，也没有需要特别关注的事项。');
  });
  it('提醒、日期安排和截止用自然句表达，不把未完成提醒写成逾期', () => {
    const read = (id, reason, at) =>
      dailyBriefServiceInternals.buildBrief(calendar, [
        todo({ id, entries: [{ id: 'one', title: '送花', at, reason }] }),
      ]).insights[0].text;
    expect(read('todo_scheduled_today', 'reminder', '2026-10-22T23:00')).toBe(
      '今天留意一下「送花」：已设置 23:00 提醒，目前仍待完成。',
    );
    expect(read('todo_scheduled_today', 'reminder', '2026-10-22T09:00')).not.toMatch(/逾期|即将|截止/);
    expect(read('todo_overdue', 'plan', '2026-10-21')).toBe('此前安排的「送花」仍待完成（计划日期 10-21）。');
    expect(read('todo_overdue', 'due', '2026-10-21T23:00')).toBe(
      '「送花」已超过截止时间（10-21 23:00），目前仍未完成。',
    );
  });
  it('缺少真实内容时不再根据审核、提醒、整理数量拼接通用建议', () => {
    const review = { id: 'organize_ai_pending', count: 3 };
    const pending = { id: 'organize_pending', count: 4 };
    const brief = dailyBriefServiceInternals.buildBrief(calendar, [review, pending]);
    expect(brief.recommendation).toBe('');
    expect(brief.recommendationFactIds).toBeUndefined();
    expect(brief.recommendationKind).toBeUndefined();
    for (const facts of [[review], [pending], [{ id: 'organize_untagged', count: 510 }]])
      expect(dailyBriefServiceInternals.buildBrief(calendar, facts).recommendation).toBe('');
    const resolved = dailyBriefServiceInternals.buildBrief(calendar, [{ ...review, count: 0 }, pending]);
    expect(resolved.recommendation).toBe('');
  });
  it('成果只展示名称和未保存状态，不展示正文结论；标题按普通文本处理', () => {
    const facts = [
      {
        id: 'workshop_result',
        count: 1,
        samples: ['有依据的结论。'],
        sources: [{ type: 'toolbox_task', id: 'job', title: '选型 {{workshop_result.count}}' }],
      },
    ];
    const brief = dailyBriefServiceInternals.buildBrief(calendar, facts);
    expect(brief.insights[0]).toMatchObject({
      text: '《选型 {{workshop_result.count}}》已生成，尚未保存。',
    });
    expect(dailyBriefServiceInternals.buildBrief(calendar, facts, brief).insights).toEqual(brief.insights);
    expect(dailyBriefServiceInternals.buildBrief({ ...calendar, locale: 'en-US' }, facts).insights[0].text).toBe(
      '“选型 {{workshop_result.count}}” is ready and has not been saved.',
    );
  });
  it('英文整理背景保留真实类型与建议种类，未知值不变成文字或动作', () => {
    const brief = dailyBriefServiceInternals.buildBrief({ ...calendar, locale: 'en-US' }, [
      {
        id: 'organize_ai_pending',
        count: 3,
        resourceTypes: ['note', 'note', 'unknown'],
        kinds: ['tags', 'title', 'unsafe'],
      },
    ]);
    expect(brief.insights[0].text).toBe(
      '3 organizing suggestions are ready for review. Covering notes; suggestions include tags and titles.',
    );
  });
  it('纯收藏和共同标签不会凑成洞察，缺少依据的项目也不入选', () => {
    const facts = ['bookmark_created_yesterday', 'note_created_yesterday', 'resource_connection'].map((id) => ({
      id,
      count: 10,
      samples: ['标题'],
    }));
    facts.push({ id: 'workshop_due', count: 1, urgency: 'upcoming' });
    expect(selectDailyBriefFacts(facts)).toEqual([]);
    expect(dailyBriefServiceInternals.buildBrief(calendar, facts)).toMatchObject({
      generatedBy: 'facts',
      insights: [],
      recommendation: '',
      headline: '今天暂无需特别关注的事项',
    });
  });
  it('单次任务先于项目和新成果，展示准确时间与服务端绑定的任务入口', () => {
    const facts = [
      todo(),
      {
        id: 'workshop_due',
        count: 1,
        urgency: 'today',
        samples: ['项目 · 今天到期'],
        sources: [{ type: 'research_workspace', id: 'p' }],
      },
      { id: 'workshop_result', count: 1, samples: ['原结论'], sources: [{ type: 'toolbox_task', id: 'job' }] },
    ];
    const brief = dailyBriefServiceInternals.buildBrief(calendar, facts, {
      insights: [
        {
          factIds: ['workshop_result'],
          text: '新成果：{{workshop_result.sample}}',
          sources: [{ type: 'todo', id: 'forged' }],
        },
      ],
    });
    expect(brief.insights.map((i) => i.id)).toEqual(['todo_one', 'workshop_due', 'workshop_result']);
    expect(brief.insights[0]).toMatchObject({
      text: '「提交报销材料」需要在今天 15:00 前完成，目前仍待处理。',
      sources: [{ type: 'todo', id: 'one' }],
    });
    expect(brief.insights[2].sources).toEqual(facts[2].sources);
    expect(brief.recommendation).toBe('');
  });
  it('开始、提醒和计划日期不冒充截止时间', () => {
    for (const [reason, label] of [
      ['start', '今天 15:00 开始'],
      ['reminder', '已设置 15:00 提醒'],
      ['plan', '今天安排'],
    ]) {
      const fact = todo({
        id: reason === 'plan' ? 'todo_due_today' : 'todo_scheduled_today',
        entries: [{ id: 'one', title: '行动', at: '2026-10-22 15:00', reason }],
      });
      expect(dailyBriefServiceInternals.buildBrief(calendar, [fact]).insights[0].text).toContain(label);
    }
  });
  it('当前一轮有效建议仍待审核就展示，不按启动时间隐藏', () => {
    for (const recent of [true, false]) {
      const brief = dailyBriefServiceInternals.buildBrief(calendar, [{ id: 'organize_ai_pending', count: 3, recent }]);
      expect(brief.insights).toEqual([
        { id: 'organize_summary', factIds: ['organize_ai_pending'], text: '有 3 条 AI 整理建议待审核。' },
      ]);
    }
  });
  it('待整理与无标签分别计数、合并成一条，待办与其他报告都保留', () => {
    const facts = [
      todo(),
      { id: 'organize_ai_pending', count: 3, recent: false, route: '/organize?issue=ai_suggestions' },
      { id: 'organize_pending', count: 4, route: '/organize?issue=pending' },
      { id: 'organize_untagged', count: 510, route: '/organize?issue=untagged' },
      {
        id: 'workshop_due',
        count: 1,
        urgency: 'upcoming',
        samples: ['项目 · 即将到期'],
        sources: [{ type: 'research_workspace', id: 'project' }],
      },
      {
        id: 'workshop_next_step',
        count: 1,
        samples: ['另一个项目：核对来源'],
        sources: [{ type: 'research_workspace', id: 'next' }],
      },
      { id: 'workshop_result', count: 1, samples: ['成果结论'], sources: [{ type: 'toolbox_task', id: 'result' }] },
    ];
    const brief = dailyBriefServiceInternals.buildBrief(calendar, facts);
    expect(brief.insights.map((item) => item.id)).toEqual([
      'todo_one',
      'workshop_due',
      'workshop_result',
      'organize_summary',
    ]);
    expect(brief.insights[3]).toMatchObject({
      factIds: ['organize_ai_pending', 'organize_pending', 'organize_untagged'],
      text: '有 3 条 AI 整理建议待审核。 4 项资料待整理；510 项资源尚无标签。',
    });
    expect(brief.sections.find((section) => section.id === 'organize').items).toEqual(facts.slice(1, 4));
    expect(brief.insights.some((item) => item.text.includes('514'))).toBe(false);
    expect(brief.recommendationKind).toBeUndefined();
    expect(brief.recommendation).toBe('');
  });
  it('没有临近到期项目时展示明确下一步，不依赖存在待办', () => {
    const next = {
      id: 'workshop_next_step',
      count: 1,
      samples: ['项目：核对来源'],
      sources: [{ type: 'research_workspace', id: 'project' }],
    };
    expect(dailyBriefServiceInternals.buildBrief(calendar, [next]).insights).toEqual([
      { id: next.id, factIds: [next.id], text: next.samples[0], sources: next.sources },
    ]);
  });
  it('失败优先且不与成果互斥，五类齐全时保留全部内容和整理入口', () => {
    const failure = {
      id: 'workshop_attention',
      count: 1,
      samples: ['工坊任务处理失败：报告'],
      sources: [{ type: 'toolbox_task', id: 'failed', title: '失败报告' }],
    };
    expect(dailyBriefServiceInternals.buildBrief(calendar, [failure]).insights[0]).toMatchObject({
      id: failure.id,
      text: failure.samples[0],
    });
    const facts = [
      todo(),
      failure,
      { id: 'workshop_due', count: 1, samples: ['临近到期项目'], sources: [{ type: 'research_workspace', id: 'p' }] },
      { id: 'workshop_result', count: 1, samples: ['成果结论'], sources: [{ type: 'toolbox_task', id: 'result' }] },
      { id: 'organize_ai_pending', count: 3 },
      { id: 'organize_pending', count: 4 },
      { id: 'organize_untagged', count: 510 },
    ];
    const brief = dailyBriefServiceInternals.buildBrief(calendar, facts);
    expect(brief.insights.map((item) => item.id)).toEqual([
      'workshop_attention',
      'todo_one',
      'workshop_due',
      'workshop_result',
      'organize_summary',
    ]);
    expect(brief.insights.at(-1).factIds).toEqual(['organize_ai_pending', 'organize_pending', 'organize_untagged']);
    expect(brief.sections.find((section) => section.id === 'organize').items).toEqual(facts.slice(-3));
    expect(brief.recommendation).toBe('');
    expect(brief.recommendationFactIds).toBeUndefined();
    expect(selectDailyBriefFacts(facts).some((fact) => fact.id === 'workshop_attention')).toBe(true);
    // 输入顺序不决定展示优先级；失败消失后成果和其他类型仍保持原顺序。
    expect(dailyBriefServiceInternals.buildBrief(calendar, [...facts].reverse()).insights).toEqual(brief.insights);
    expect(
      dailyBriefServiceInternals
        .buildBrief(
          calendar,
          facts.filter((fact) => fact !== failure),
        )
        .insights.map((item) => item.id),
    ).toEqual(['todo_one', 'workshop_due', 'workshop_result', 'organize_summary']);
  });
  it('整理事项处理完成后不留零数量入口，英文分别说明集合', () => {
    const facts = [
      { id: 'organize_pending', count: 4 },
      { id: 'organize_untagged', count: 0 },
      { id: 'organize_ai_pending', count: 0 },
    ];
    const brief = dailyBriefServiceInternals.buildBrief({ ...calendar, locale: 'en-US' }, facts);
    expect(brief.insights).toEqual([
      { id: 'organize_summary', factIds: ['organize_pending'], text: '4 resources await organizing.' },
    ]);
    expect(brief.sections.find((section) => section.id === 'organize').items).toEqual([facts[0]]);
    facts[0].count = 0;
    expect(dailyBriefServiceInternals.buildBrief(calendar, facts).insights).toEqual([]);
  });
  it('待办最多占一条，不占用其他报告的展示位置', () => {
    const fact = todo({
      count: 11,
      entries: Array.from({ length: 4 }, (_, i) => ({ id: String(i), title: '事项', at: '', reason: 'due' })),
    });
    const brief = dailyBriefServiceInternals.buildBrief(calendar, [fact]);
    expect(brief.insights).toHaveLength(1);
    expect(brief).not.toHaveProperty('remainingTodoCount');
    expect(brief.headline).toBe('');
  });
  it('已回填成果与标题中的模板字样不再次解释', () => {
    const fact = {
      id: 'workshop_result',
      count: 1,
      samples: ['资料 {{workshop_result.count}}'],
      sources: [{ type: 'toolbox_task', id: 'job' }],
    };
    const brief = dailyBriefServiceInternals.buildBrief(calendar, [fact], {
      insights: [{ factIds: ['workshop_result'], text: '{{workshop_result.sample}}' }],
    });
    expect(brief.insights[0].text).toBe(fact.samples[0]);
    expect(dailyBriefServiceInternals.hydrateBriefNarrative(brief).insights[0].text).toBe(fact.samples[0]);
    expect(
      dailyBriefServiceInternals.buildBrief(calendar, [fact], { ...brief, narrativeHydrated: true }).insights[0].text,
    ).toBe(fact.samples[0]);
  });
  it('账号时区决定自然日边界，夏令时当天不假设固定24小时', () => {
    const c = dailyBriefServiceInternals.resolveCalendar(
      { timezone: 'America/Los_Angeles', locale: 'en-US' },
      new Date('2026-11-01T08:00:00Z'),
    );
    expect(c).toMatchObject({
      date: '2026-11-01',
      nextDateAt: '2026-11-02T08:00:00Z',
      todayStart: '2026-11-01 15:00:00',
      todayEnd: '2026-11-02 16:00:00',
    });
  });
  it('GET 不生成、不重领过期租约；关闭功能不读取产物', async () => {
    const db = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ preferences: '{}' }]])
        .mockResolvedValueOnce([[{ status: 'generating', leaseExpired: 1 }]]),
    };
    expect(await getDailyBrief(db, { userId: 'u' })).toMatchObject({
      status: 'failed',
      lastErrorCode: 'DAILY_BRIEF_GENERATION_STALE',
    });
    expect(db.query).toHaveBeenCalledTimes(2);
    const disabled = { query: vi.fn().mockResolvedValue([[{ preferences: '{"dailyBrief":false}' }]]) };
    expect(await getDailyBrief(disabled, { userId: 'u' })).toMatchObject({ status: 'disabled' });
    expect(disabled.query).toHaveBeenCalledTimes(1);
  });
  it('设置写入限定当前账号，字段省略不覆盖自动更新偏好', async () => {
    const db = { query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    await expect(updateDailyBriefPreference(db, 'u', true, 'false')).rejects.toMatchObject({
      code: 'DAILY_BRIEF_PREFERENCE_INVALID',
    });
    expect(db.query).not.toHaveBeenCalled();
    await updateDailyBriefPreference(db, 'u', false);
    expect(db.query.mock.calls[0][1]).toEqual(['false', 'u']);
    expect(db.query.mock.calls[0][0]).not.toContain('dailyBriefAutoUpdate');
  });
});
