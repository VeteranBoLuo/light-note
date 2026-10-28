import { expect, it } from 'vitest';
import { adviceContext, adviceModelSignals, resolveAdvice, validateAdviceSignals } from './dailyBriefAdvice.js';
import { dailyBriefServiceInternals } from './dailyBriefService.js';
import { validateDailyBriefInput, validateDailyBriefArguments } from '../aiSkill/skills/routineDailyBriefSkill.js';
const calendar = { date: '2026-10-27', locale: 'zh-CN', timezone: 'Asia/Shanghai' };
const samples = [
  [
    [
      {
        id: 'todo_due_today',
        count: 1,
        entries: [{ id: 't', title: '提交材料', at: '2026-10-27 16:00', reason: 'due' }],
      },
    ],
    ['todo_due_today'],
    '可以先完成今天到期的待办，再处理没有明确时限的整理事项。',
  ],
  [
    [
      { id: 'organize_ai_pending', count: 3, resourceTypes: ['bookmark'], kinds: ['title'] },
      { id: 'organize_pending', count: 9 },
    ],
    ['organize_ai_pending', 'organize_pending'],
    '先审核已经准备好的整理建议，确认可用的改动，再继续处理剩余待整理资料。',
  ],
  [
    [{ id: 'file_created_today', count: 2 }],
    ['file_created_today'],
    '可以先确认今天新增文件是否放在合适的位置，避免收集后难以再次找到。',
  ],
  [
    [
      {
        id: 'workshop_result',
        count: 1,
        samples: ['已生成'],
        sources: [{ type: 'toolbox_task', id: 'j', title: '研究成果' }],
      },
    ],
    ['workshop_result'],
    '可先查看并保存尚未保存的工坊成果，留下可继续使用的结果。',
  ],
  [
    [
      {
        id: 'workshop_attention',
        count: 1,
        samples: ['失败'],
        sources: [{ type: 'toolbox_task', id: 'f', title: '任务' }],
      },
    ],
    ['workshop_attention'],
    '可以先查看失败任务的状态与原资料，再决定是否需要重新发起处理。',
  ],
  [
    [
      {
        id: 'workshop_due',
        count: 1,
        urgency: 'today',
        dueDate: '2026-10-27',
        pendingCount: 2,
        samples: ['到期'],
        sources: [{ type: 'learning_workspace', id: 'p', title: '学习项目' }],
      },
    ],
    ['workshop_due'],
    '先进入今天到期的工坊项目，核对未完成的行动，再继续其他整理工作。',
  ],
];
it.each(samples)('由结构化工作状态给出行动，不需要任何资料正文：%j', (facts, factIds, action) => {
  const context = adviceContext(facts, calendar.locale);
  const input = validateDailyBriefInput({ ...calendar, signals: adviceModelSignals(context.signals) });
  const draft = validateDailyBriefArguments({ insights: [], recommendation: { factIds, action } }, input.signals);
  const brief = dailyBriefServiceInternals.buildBrief(calendar, facts, {
    adviceKey: context.key,
    adviceProposal: draft.recommendation,
  });
  expect(brief.recommendation).toBe(action);
  expect(brief.recommendationFactIds).toEqual(factIds);
  expect(brief.recommendation).not.toContain('片段');
});
it('正文、任意资源标题和结果内容不进入建议上下文，也不触发再次分析', () => {
  const facts = [
    { id: 'organize_pending', count: 2, resources: [{ title: '随便写的产品意见', content: '私人正文' }] },
    {
      id: 'workshop_result',
      count: 1,
      samples: ['私人结论'],
      sources: [{ type: 'toolbox_task', id: 'j', title: '定位标题' }],
    },
  ];
  const before = adviceContext(facts, 'zh-CN');
  const sent = adviceModelSignals(before.signals);
  expect(JSON.stringify(sent)).not.toMatch(/私人|随便写|sources|content|samples/);
  const changed = structuredClone(facts);
  changed[0].resources = [{ title: '别的随笔', content: '新正文' }];
  changed[1].samples = ['另一段随意结论'];
  expect(adviceContext(changed, 'zh-CN').key).toBe(before.key);
  expect(adviceContext([{ ...facts[0], count: 3 }, facts[1]], 'zh-CN').key).not.toBe(before.key);
  expect(adviceContext(facts, 'en-US').key).not.toBe(before.key);
});
it('定位仅由服务器绑定，模型无权伪造资源入口；已无事项时不创建判断缓存', () => {
  const { signals } = adviceContext(samples[0][0], 'zh-CN');
  expect(adviceModelSignals(signals)[0]).not.toHaveProperty('sources');
  const proposal = { factIds: ['todo_due_today'], action: '可以先处理今天到期的待办，再处理没有时限的收集事项。' };
  expect(resolveAdvice(proposal, signals).sources).toEqual([{ type: 'todo', id: 't', title: '提交材料' }]);
  expect(() => resolveAdvice({ ...proposal, url: 'https://invalid.test' }, signals)).toThrow('ADVICE_SHAPE');
  expect(adviceContext([{ id: 'organize_pending', count: 0 }], 'zh-CN')).toEqual({ signals: [], key: '' });
});
it('反复计数或已有正文不冒充行动；支持真实空判断', () => {
  const { signals } = adviceContext(samples[1][0], 'zh-CN');
  const action = '有待审核的整理建议和待整理资料，目前仍然需要处理。';
  expect(resolveAdvice({ factIds: ['organize_pending'], action }, signals, [action])).toBeNull();
  expect(resolveAdvice(null, signals)).toBeNull();
});
it.each(['1,620', '１，６２０', '1620'])('同一真实数量的正常排版不误判为编造数字：%s', (count) => {
  const { signals } = adviceContext([{ id: 'organize_untagged', count: 1620 }], 'zh-CN');
  const action = `可以先给 ${count} 项无标签资料分批补上标签，再继续收集新资料。`;
  expect(resolveAdvice({ factIds: ['organize_untagged'], action }, signals)?.action).toBe(action);
});
it.each(['1,621', '１，６２１', '1,62', '16,20', '1,6200', '10', '１０', '1-2'])(
  '数量归一化仍拒绝无依据的数值、错误分组和范围：%s',
  (count) => {
    const { signals } = adviceContext([{ id: 'organize_untagged', count: 1620 }], 'zh-CN');
    expect(() =>
      resolveAdvice(
        { factIds: ['organize_untagged'], action: `可以先处理 ${count} 项无标签资料，再继续收集新资料。` },
        signals,
      ),
    ).toThrow('ADVICE_NUMBER_UNSUPPORTED');
  },
);
it('数字依据仍限定到实际引用的状态，时间和标题不能冒充数量依据', () => {
  const { signals } = adviceContext(
    [
      { id: 'organize_pending', count: 2 },
      { id: 'organize_untagged', count: 1620 },
      {
        id: 'todo_scheduled_today',
        count: 1,
        entries: [{ id: 't', title: '阅读 10 页', at: '2026-10-28T18:35', reason: 'reminder' }],
      },
    ],
    'zh-CN',
  );
  expect(() =>
    resolveAdvice(
      { factIds: ['organize_pending'], action: '可以先整理 1,620 项无标签资料，再继续处理其他事情。' },
      signals,
    ),
  ).toThrow('ADVICE_NUMBER_UNSUPPORTED');
  expect(
    resolveAdvice(
      { factIds: ['todo_scheduled_today'], action: '可以在 18:35 提醒前确认「阅读 10 页」需要准备的材料。' },
      signals,
    ),
  ).toBeTruthy();
  expect(() =>
    resolveAdvice(
      { factIds: ['todo_scheduled_today'], action: '可以先花 10 分钟完成准备，再等待当前待办的提醒。' },
      signals,
    ),
  ).toThrow('ADVICE_NUMBER_UNSUPPORTED');
  expect(() =>
    resolveAdvice(
      { factIds: ['todo_scheduled_today'], action: '可以在 18:36 提醒前确认待办需要准备的材料。' },
      signals,
    ),
  ).toThrow('ADVICE_NUMBER_UNSUPPORTED');
});
const timedSignals = adviceContext(
  [
    {
      id: 'todo_scheduled_today',
      count: 1,
      entries: [{ id: 't', title: '阅读 10 页', at: '2026-10-28T18:35', reason: 'reminder' }],
    },
    { id: 'workshop_due', count: 1, dueDate: '2026-10-30' },
  ],
  'zh-CN',
).signals;
it.each(['18:35', '１８：３５', '18点35分', '18时35分', '18点35', '6:35 PM', '18:35:00'])(
  '真实提醒时间的不同写法可直接交付：%s',
  (time) => {
    const action = `可以在 ${time} 提醒前准备阅读材料，再继续其他安排。`;
    expect(resolveAdvice({ factIds: ['todo_scheduled_today'], action }, timedSignals)?.action).toBe(action);
  },
);
it.each(['2026-10-30', '2026/10/30', '2026年10月30日', '10月30日', '10-30', '10/30'])(
  '真实项目日期的不同写法可直接交付：%s',
  (date) => {
    const action = `可以先核对 ${date} 到期项目的未完成行动，再继续整理。`;
    expect(resolveAdvice({ factIds: ['workshop_due'], action }, timedSignals)?.action).toBe(action);
  },
);
it.each(['18:36', '18点半', '6:35 AM', '18:35:01', '18点350分', '2027年10月28日', '10月29日', '2027-10-28'])(
  '日期时间归一化不能扩大事实范围：%s',
  (value) => {
    expect(() =>
      resolveAdvice(
        { factIds: ['todo_scheduled_today'], action: `可以在 ${value} 提醒前准备材料，再继续其他安排。` },
        timedSignals,
      ),
    ).toThrow('ADVICE_NUMBER_UNSUPPORTED');
  },
);
it.each(['阅读 10 页', "'阅读 10 页'", '‘阅读 10 页’', '「阅读 10 页」'])('完整数字标题不依赖特定引号：%s', (title) => {
  expect(
    resolveAdvice(
      { factIds: ['todo_scheduled_today'], action: `可以先为 ${title} 准备材料，等提醒后再继续处理。` },
      timedSignals,
    ),
  ).toBeTruthy();
});
it.each(['10', '10分钟', '10 minutes', 'Chapter 10'])('纯数字、时长和标题的局部命中不能成为数字依据：%s', (title) => {
  const signals = [{ id: 'todo_due_today', count: 1, label: '待办', title }];
  const action =
    title === 'Chapter 10'
      ? 'Please review Chapter 10.1 before starting the next task.'
      : '可以先花 10 分钟准备材料，再继续处理当前待办。';
  expect(() => resolveAdvice({ factIds: ['todo_due_today'], action }, signals)).toThrow('ADVICE_NUMBER_UNSUPPORTED');
});
it.each(['月', '10月'])('标题不能删掉日期单位或相邻数字而绕过日期校验：%s', (title) => {
  const signals = [
    { id: 'workshop_next_step', count: 1, pendingCount: title === '月' ? 1030 : 30, label: '项目下一步', title },
  ];
  expect(() =>
    resolveAdvice(
      { factIds: ['workshop_next_step'], action: '可以先确认10月30日之前的项目安排，再继续整理资料。' },
      signals,
    ),
  ).toThrow('ADVICE_NUMBER_UNSUPPORTED');
});
it.each([
  { factIds: ['foreign'], action: '可以先检查当前状态，再按实际需要处理资料。' },
  { factIds: ['organize_pending', 'organize_pending'], action: '可以先检查当前状态，再按实际需要处理资料。' },
  { factIds: ['organize_pending'], action: '可以用 10 分钟完成全部待整理资料的归类。' },
  { sourceKey: 'material_1', quote: '随便写的资料', action: '可以根据这段资料去实现一个新功能。' },
])('拒绝未知来源、重复编号、编造耗时和旧正文协议：%j', (proposal) => {
  const { signals } = adviceContext(samples[1][0], 'zh-CN');
  expect(() => resolveAdvice(proposal, signals)).toThrow();
});
it('信号协议有界且闭合，拒绝把正文偷偷放进输入', () => {
  const signal = { id: 'organize_pending', label: '待整理', count: 3 };
  expect(validateAdviceSignals([signal])).toEqual([signal]);
  for (const value of [
    [],
    [signal, signal],
    [{ ...signal, count: -1 }],
    [{ ...signal, excerpt: '私人内容' }],
    [{ ...signal, body: '私人正文' }],
  ])
    expect(() => validateAdviceSignals(value)).toThrow();
  expect(() =>
    validateDailyBriefInput({ ...calendar, signals: [signal], evidence: [{ excerpt: '旧内容' }] }),
  ).toThrow();
});
