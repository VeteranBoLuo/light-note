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
