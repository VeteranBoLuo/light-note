import { expect, it } from 'vitest';
import { compileAdviceEvidence, resolveAdvice, adviceContext, ADVICE_FACT_ID } from './dailyBriefAdvice.js';
import { validateDailyBriefInput, validateDailyBriefArguments } from '../aiSkill/skills/routineDailyBriefSkill.js';
import { dailyBriefServiceInternals } from './dailyBriefService.js';
const excerpt = '离线导出目前只保存正文，不包含附件；计划在导出时提示附件需要单独备份，避免资料遗漏。';
const evidence = compileAdviceEvidence([
  { resourceType: 'note', resourceId: 'owned', title: '导出方案', summary: `<p>${excerpt}</p>` },
]);
const proposal = {
  sourceKey: 'material_1',
  quote: '离线导出目前只保存正文，不包含附件',
  action: '可以在导出验收清单中加入附件备份检查，并核对导出提示是否说明这一限制。',
};

it('只读取有界真实文本；去除执行内容、排除文件名与绘图；标题不当作正文', () => {
  expect(evidence).toHaveLength(1);
  expect(evidence[0].excerpt).toBe(excerpt);
  expect(
    compileAdviceEvidence([
      { resourceType: 'file', resourceId: 'f', title: '工作计划.pdf', summary: excerpt },
      { resourceType: 'note', resourceId: 'd', title: '绘图', detail: 'drawing', summary: excerpt },
      {
        resourceType: 'note',
        resourceId: 'n',
        title: '有意义的标题',
        summary: '<script>一段不能成为资料依据的脚本内容</script>你好',
      },
    ]),
  ).toEqual([]);
  expect(
    compileAdviceEvidence([
      { resourceType: 'bookmark', resourceId: 'b', title: '长描述', summary: '真实资料内容'.repeat(300) },
    ])[0].excerpt,
  ).toHaveLength(600);
});
it('仅凭真实引用生成具体建议，来源由服务器绑定，不重复正文或原文', () => {
  expect(resolveAdvice(proposal, evidence)).toMatchObject({ source: { id: 'owned', type: 'note' } });
  expect(resolveAdvice(proposal, evidence, [proposal.action])).toBeNull();
  expect(resolveAdvice({ ...proposal, action: proposal.quote }, evidence)).toBeNull();
  expect(resolveAdvice(null, evidence)).toBeNull();
  for (const invalid of [
    { ...proposal, sourceKey: 'foreign' },
    { ...proposal, quote: '原文并未提供这条依据' },
    { ...proposal, action: '可以用 10 分钟完成导出检查和附件备份。' },
    { ...proposal, url: 'https://untrusted.test' },
  ])
    expect(() => resolveAdvice(invalid, evidence)).toThrow();
});

it('先过滤再选三项，短正文和已准备文件可入选；格式标签不挤掉正文', () => {
  const items = [1, 2, 3].map((id) => ({ resourceType: 'file', resourceId: String(id), title: '未解析文件' }));
  const short = '离线导出不含附件，验收前需要单独备份。';
  items.push({
    resourceType: 'note',
    resourceId: 'short',
    title: '短笔记',
    summary: `<p style="${'x'.repeat(1100)}">${short}</p>`,
  });
  items.push({ resourceType: 'file', resourceId: 'ready', title: '已解析文件', preparedText: excerpt });
  items.push({ resourceType: 'note', resourceId: 'drawing', title: '画图', detail: 'drawing', summary: excerpt });
  items.push({ resourceType: 'note', resourceId: 'text', title: '笔记', summary: excerpt });
  const selected = compileAdviceEvidence(items);
  expect(selected.map((item) => item.source.id)).toEqual(['short', 'ready', 'text']);
  expect(selected[0].excerpt).toBe(short);
  expect(selected.map((item) => item.key)).toEqual(['material_1', 'material_2', 'material_3']);
  expect(compileAdviceEvidence([{ resourceType: 'bookmark', resourceId: 'url', title: '链接', preparedText: 'https://example.com/only-url' }])).toEqual([]);
});
it('建议专用输入可以没有成果，但无材料、越界输入和伪造引用不能通过工具协议', () => {
  const input = {
    date: '2026-10-22',
    timezone: 'Asia/Shanghai',
    locale: 'zh-CN',
    facts: [],
    evidence: evidence.map(({ key, title, excerpt }) => ({ key, title, excerpt })),
    body: [],
  };
  expect(validateDailyBriefInput(input).facts).toEqual([]);
  expect(
    validateDailyBriefArguments({ insights: [], recommendation: proposal }, [], input.evidence).recommendation,
  ).toEqual(proposal);
  expect(
    validateDailyBriefArguments({ insights: [], recommendation: null }, [], input.evidence).recommendation,
  ).toBeNull();
  expect(() =>
    validateDailyBriefArguments(
      { insights: [], recommendation: { ...proposal, quote: '这个引用根本不存在于资料中' } },
      [],
      input.evidence,
    ),
  ).toThrow();
  expect(() => validateDailyBriefInput({ ...input, evidence: [] })).toThrow();
  expect(() => validateDailyBriefInput({ ...input, evidence })).toThrow(); // 原始对象身份不进入模型
  expect(() => validateDailyBriefArguments({ insights: [] }, [], input.evidence)).toThrow('必须明确返回');
  expect(validateDailyBriefArguments({ insights: [] }, [], []).recommendation).toBeUndefined();
});
it('建议绑定证据版本、保留片段范围及入口；不泄漏未引用的完整片段', () => {
  const facts = [
    { id: ADVICE_FACT_ID, evidence },
    { id: 'organize_pending', count: 1 },
  ];
  const { key } = adviceContext(facts, 'zh-CN');
  const brief = dailyBriefServiceInternals.buildBrief({ date: '2026-10-22', locale: 'zh-CN' }, facts, {
    adviceKey: key,
    adviceProposal: proposal,
  });
  expect(brief.recommendation).toContain('的片段提到');
  expect(brief.recommendation).toContain(proposal.action);
  expect(brief.recommendationSources[0].id).toBe('owned');
  expect(brief.recommendationKind).toBe('ai');
  expect(JSON.stringify(brief)).not.toContain(excerpt);
  expect(adviceContext([...facts, { id: 'file_created_today', count: 2 }], 'zh-CN').key).toBe(key);
  expect(adviceContext(facts, 'en-US').key).not.toBe(key);
  expect(
    dailyBriefServiceInternals.buildBrief({ locale: 'zh-CN' }, [], { adviceKey: key, adviceProposal: proposal })
      .recommendation,
  ).toBe('');
});

it('引用容忍换行和空白排版差异，仍回填原文；改写、拼接和未知来源拒绝', () => {
  const spaced = [{ ...evidence[0], excerpt: '离线导出目前只保存正文， 不包含附件；请单独备份附件。' }];
  expect(resolveAdvice(proposal, spaced).quote).toBe('离线导出目前只保存正文， 不包含附件');
  for (const quote of ['离线导出目前只保存正文……不包含附件', '离线导出不会保存正文，不包含附件'])
    expect(() => resolveAdvice({ ...proposal, quote }, spaced)).toThrow('ADVICE_QUOTE_NOT_FOUND');
  expect(() => resolveAdvice({ ...proposal, sourceKey: 'missing' }, spaced)).toThrow('ADVICE_SOURCE_UNKNOWN');
});
it('中英文通用建议和正文近似重复均不展示', () => {
  for (const action of [
    '可以先对这些待整理资料进行整理，确认修改。',
    'Please review the pending materials and organize the resources.',
  ])
    expect(resolveAdvice({ ...proposal, action }, evidence)).toBeNull();
  expect(resolveAdvice(proposal, evidence, [proposal.action.replace('可以', '建议')])).toBeNull();
});

it('不借用正文中的待办给产品反馈凑建议，也不复述短引文之外已经明确的行动', () => {
  const material = [{ ...evidence[0], title: '工作台反馈', excerpt: '简报没有重点，今天有待办时应该把提醒放在前面。' }];
  const feedback = {
    sourceKey: 'material_1',
    quote: '今天有待办时应该把提醒放在前面',
    action: '可考虑在简报开头单列一个「今日待办」区块，把例行签到提醒放在最前面，再列整理统计。',
  };
  expect(resolveAdvice(feedback, material, ['今天留意一下「例行签到」：已设置提醒，目前仍待完成。'])).toBeNull();
  const request = [
    {
      ...evidence[0],
      excerpt: '这段学习说明将回忆和核对分成两个环节，先合上资料复述核心论点，再打开原文逐项核对遗漏。',
    },
  ];
  expect(
    resolveAdvice(
      {
        ...proposal,
        quote: '这段学习说明将回忆和核对分成两个环节',
        action: '可以先合上资料复述核心论点，再打开原文逐项核对遗漏。',
      },
      request,
    ),
  ).toBeNull();
});

it('英文正文身份也只用于排重；同名在所选资料中有依据时仍允许具体检查', () => {
  const material = [
    {
      ...evidence[0],
      title: 'Brief feedback',
      excerpt: 'The brief should prioritize reminders ahead of organizing statistics.',
    },
  ];
  const feedback = {
    sourceKey: 'material_1',
    quote: 'The brief should prioritize reminders',
    action: 'Consider placing Check in ahead of the organizing statistics in a dedicated section.',
  };
  expect(resolveAdvice(feedback, material, ['“Check in” has a reminder set.'])).toBeNull();
  const grounded = [{ ...evidence[0], excerpt: excerpt + '需要验证「附件备份」待办中的限制提示。' }];
  expect(
    resolveAdvice(
      { ...proposal, action: '可以对照附件备份待办与导出页面，核对两处是否使用一致的附件范围说明。' },
      grounded,
      ['今天留意一下「附件备份」。'],
    ),
  ).not.toBeNull();
});

it('保留没有缺陷的知识应用建议，不靠全面提高门槛减少输出', () => {
  const material = [
    { ...evidence[0], excerpt: '主动回忆要求在不看资料时提取已学内容，再对照原文发现遗漏，比重复阅读更有助于理解。' },
  ];
  const application = {
    ...proposal,
    quote: '主动回忆要求在不看资料时提取已学内容',
    action: '读完这段后可合上资料写出中心论点，再打开原文核对遗漏的条件。',
  };
  expect(resolveAdvice(application, material, ['今天留意一下「例行签到」。'])).toMatchObject({
    action: application.action,
  });
});

const normalMaterialCases = [
  [
    '学习笔记',
    '主动回忆是在不看原文时提取记忆，再通过反馈发现遗漏。',
    '主动回忆是在不看原文时提取记忆',
    '阅读这份资料后，可合上正文复述要点，再打开原文检查遗漏。',
    '今天留意一下「阅读」：目前仍待完成。',
  ],
  [
    '论证结构',
    '论证段落应明确区分结论与支持结论的证据，避免把二者混为一谈。',
    '论证段落应明确区分结论与支持结论的证据',
    '写作时可用这段方法改写一个段落，核对结论与证据是否对应。',
    '今天留意一下「写作」：目前仍待完成。',
  ],
  [
    'Memory notes',
    'Recall requires retrieving a concept from memory before checking the original explanation.',
    'Recall requires retrieving a concept from memory',
    'Review this explanation by recalling its main concept, then compare your account with the original.',
    '“Review” has a reminder set.',
  ],
  [
    '接口设计',
    '接口重试必须携带相同的请求标识，服务端用唯一约束防止重复创建。',
    '接口重试必须携带相同的请求标识',
    '可用相同请求标识连续提交接口，核对是否始终返回同一个已创建结果。',
    '今天留意一下「打卡」：目前仍待完成。',
  ],
  [
    '方案对照',
    '本地索引支持离线读取，远程索引需要联网，但可在设备之间共享更新。',
    '本地索引支持离线读取，远程索引需要联网',
    '可以分别按离线可用性和跨设备更新列出两种索引的差异，再对照各自适用的场景。',
    '今天留意一下「方案」：目前仍待完成。',
  ],
  [
    '时间文案反馈',
    '提醒时间与截止时间含义不同，当前页面将提醒误标成截止。',
    '提醒时间与截止时间含义不同',
    '可以选一条仅设置提醒且未设置截止的待办核对文案，确认两种时间概念是否被区分。',
    '今天留意一下「阅读」：目前仍待完成。',
  ],
];
it.each(normalMaterialCases)(
  '正常资料保留应用、验证与对照；不把同词当成同一待办：%s',
  (title, text, quote, action, body) => {
    for (const resourceType of ['note', 'bookmark', 'file']) {
      const selected = compileAdviceEvidence([
        {
          resourceType,
          resourceId: 'owned',
          title,
          ...(resourceType === 'file' ? { preparedText: text } : { summary: `<p>${text}</p>` }),
        },
      ]);
      expect(selected).toHaveLength(1);
      expect(resolveAdvice({ sourceKey: selected[0].key, quote, action }, selected, [body])).toMatchObject({ action });
    }
  },
);

it.each(['例行签到', 'Review', '日常(复盘)'])('排除明确引用源外事项，不依赖特定资料标题或任务名：%s', (name) => {
  const selected = [
    { ...evidence[0], title: '任意资料', excerpt: '把提醒和截止时间分开表达，避免读者混淆两种不同的时间含义。' },
  ];
  const body = [`今天留意一下「${name}」：目前仍待完成。`];
  for (const action of [
    `可以把「${name}」放在简报的最前面，再列出其他内容。`,
    `可考虑单列今天的重点，例如${name}提醒，再列出整理统计。`,
  ]) {
    expect(
      resolveAdvice({ sourceKey: 'material_1', quote: '把提醒和截止时间分开表达', action }, selected, body),
    ).toBeNull();
  }
});

it('真实模型回归：数字在同一已读片段中即可，不要求全部出现在短引文；按完整数值拒绝子串碰撞', () => {
  const materials = [{ ...evidence[0], excerpt: evidence[0].excerpt + '验收覆盖 12 种附件，单个文件限制 510 MB。' }];
  const action = '可以将 12 种附件的导出检查加入验收清单，同时核对 510 MB 限制的提示。';
  expect(resolveAdvice({ ...proposal, action }, materials).action).toBe(action);
  expect(() =>
    resolveAdvice({ ...proposal, action: '可以先验证 10 MB 附件的导出行为，再完善验收清单。' }, materials),
  ).toThrow('ADVICE_NUMBER_UNSUPPORTED');
  expect(() => resolveAdvice({ ...proposal, action }, evidence)).toThrow('ADVICE_NUMBER_UNSUPPORTED');
});
