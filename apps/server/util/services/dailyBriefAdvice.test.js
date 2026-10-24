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

it('真实模型回归：数字在同一已读片段中即可，不要求全部出现在短引文；按完整数值拒绝子串碰撞', () => {
  const materials = [{ ...evidence[0], excerpt: evidence[0].excerpt + '验收覆盖 12 种附件，单个文件限制 510 MB。' }];
  const action = '可以将 12 种附件的导出检查加入验收清单，同时核对 510 MB 限制的提示。';
  expect(resolveAdvice({ ...proposal, action }, materials).action).toBe(action);
  expect(() =>
    resolveAdvice({ ...proposal, action: '可以先验证 10 MB 附件的导出行为，再完善验收清单。' }, materials),
  ).toThrow('ADVICE_NUMBER_UNSUPPORTED');
  expect(() => resolveAdvice({ ...proposal, action }, evidence)).toThrow('ADVICE_NUMBER_UNSUPPORTED');
});
