import { describe, expect, it, vi } from 'vitest';
import { executeAiSkill } from '../runtime.js';
import { callStructuredSkillModel } from '../structuredModel.js';
import { requestAi } from '../../agent/aiGateway.js';
import routineDailyBriefSkill, {
  validateDailyBriefArguments,
  validateDailyBriefInput,
} from './routineDailyBriefSkill.js';

vi.mock('../../agent/aiGateway.js', () => ({ requestAi: vi.fn() }));

const facts = [
  ['todo_overdue', '已逾期待办'],
  ['todo_due_today', '今天待办'],
  ['bookmark_created_yesterday', '昨天新增书签'],
  ['note_created_yesterday', '昨天新增笔记'],
  ['file_created_yesterday', '昨天新增文件'],
  ['bookmark_created_today', '今天新增书签'],
  ['note_created_today', '今天新增笔记'],
  ['file_created_today', '今天新增文件'],
  ['organize_untagged', '待整理的无标签内容'],
  ['organize_ai_pending', '待确认的 AI 整理建议'],
].map(([id, label], count) => ({
  id,
  label,
  count,
  route: '/workbench',
  samples: id === 'todo_due_today' ? ['季度复盘'] : [],
}));

describe('routine.daily_brief', () => {
  it('多给的有效候选按优先级收敛到五条，不把展示取舍变成整份简报失败', () => {
    const args = {
      headline: '近期重点',
      recommendation: '稳步推进',
      insights: facts
        .filter((fact) => fact.count > 0)
        .map((fact) => ({ factIds: [fact.id], text: `当前有 {{${fact.id}.count}} 项相关内容。` })),
    };
    expect(args.insights.length).toBeGreaterThan(5);
    expect(validateDailyBriefArguments(args, facts).insights).toHaveLength(5);
    expect(validateDailyBriefArguments(args, facts).insights[0].factIds).toEqual(['todo_due_today']);
    const invalid = { ...args, insights: [...args.insights, { factIds: ['unknown'], text: '未知来源' }] };
    expect(() => validateDailyBriefArguments(invalid, facts)).toThrow();
  });
  it('合并洞察允许引用四个及以上已提供的真实事实，未知来源仍拒绝', () => {
    const factIds = ['note_created_yesterday', 'file_created_yesterday', 'note_created_today', 'file_created_today'];
    const args = {
      headline: '近期内容持续积累',
      insights: [
        {
          factIds,
          text: '昨日笔记 {{note_created_yesterday.count}} 篇、文件 {{file_created_yesterday.count}} 份；今天笔记 {{note_created_today.count}} 篇、文件 {{file_created_today.count}} 份。',
        },
      ],
      recommendation: '可以结合新旧内容一起整理。',
    };
    expect(validateDailyBriefArguments(args, facts).insights[0].factIds).toEqual(factIds);
    expect(() =>
      validateDailyBriefArguments(
        { ...args, insights: [{ ...args.insights[0], factIds: [...factIds, 'invented_fact'] }] },
        facts,
      ),
    ).toThrowError(expect.objectContaining({ details: expect.objectContaining({ unknownFactCount: 1 }) }));
  });
  it('协议占位符不挤占正文预算，同时保留模板传输上限与正文上限', () => {
    const recommendation =
      '先看 {{organize_ai_pending.count}} 条整理建议，再核对 {{note_created_yesterday.count}} 篇笔记、{{file_created_yesterday.count}} 份文件与 {{bookmark_created_yesterday.count}} 条书签，最后处理 {{organize_untagged.count}} 项无标签资料。';
    expect(recommendation.length).toBeGreaterThan(160);
    expect(
      validateDailyBriefArguments(
        { headline: '稳步整理', insights: [{ factIds: ['todo_due_today'], text: '先处理待办。' }], recommendation },
        facts,
      ).recommendation,
    ).toBe(recommendation);
    expect(() =>
      validateDailyBriefArguments(
        {
          headline: '稳步整理',
          insights: [{ factIds: ['todo_due_today'], text: '先处理待办。' }],
          recommendation: '长'.repeat(161),
        },
        facts,
      ),
    ).toThrowError(
      expect.objectContaining({ details: expect.objectContaining({ lengthKind: 'prose', maxLength: 160 }) }),
    );
    expect(() =>
      validateDailyBriefArguments(
        {
          headline: '{{note_created_yesterday.count}}'.repeat(30),
          insights: [{ factIds: ['todo_due_today'], text: '先处理待办。' }],
          recommendation: '继续整理',
        },
        facts,
      ),
    ).toThrowError(
      expect.objectContaining({ details: expect.objectContaining({ lengthKind: 'template', maxLength: 640 }) }),
    );
  });
  const draft = (text) => ({
    headline: '先处理重点',
    insights: [{ factIds: ['todo_due_today'], text }],
    recommendation: '按当前节奏继续',
  });
  const withSample = (sample) =>
    facts.map((fact) => ({
      ...fact,
      samples: fact.id === 'todo_due_today' ? [sample] : [],
    }));

  it.each(['2026 年复盘', 'NetDiagV4_20260904_221929.zip', 'Version [2].0 (draft)', 'One year review', '3'])(
    '完整引用的数字标题可以安全归一化：%s',
    (sample) => {
      const result = validateDailyBriefArguments(
        draft(`先处理《${sample}》，共 {{todo_due_today.count}} 项待办。`),
        withSample(sample),
      );
      expect(result.insights[0].text).toBe('先处理《{{todo_due_today.sample}}》，共 {{todo_due_today.count}} 项待办。');
    },
  );

  it.each(['先处理 1 项待办。', '先处理 99 项待办。', '提高 3.5%。', '预计 2026 年完成。', 'Handle two urgent items.'])(
    '数量不能按数值碰巧相等而放行：%s',
    (text) => {
      expect(() => validateDailyBriefArguments(draft(text), withSample('3'))).toThrowError(
        expect.objectContaining({
          code: 'AI_SKILL_DAILY_BRIEF_NUMERIC_CLAIM',
          details: expect.objectContaining({
            field: 'insights[0].text',
            allowedPlaceholders: ['{{todo_due_today.count}}', '{{todo_due_today.sample}}'],
          }),
        }),
      );
    },
  );

  it.each([
    ['`', '`'],
    ['‘', '’'],
  ])('完整标题支持引用边界 %s %s，边界外数字仍拦截', (open, close) => {
    const sample = 'Review 2026.09 One';
    const text = `回看 ${open}${sample}${close}。`;
    expect(validateDailyBriefArguments(draft(text), withSample(sample)).insights[0].text).toBe(
      `回看 ${open}{{todo_due_today.sample}}${close}。`,
    );
    expect(() => validateDailyBriefArguments(draft(`${text}共 99 项。`), withSample(sample))).toThrow();
    expect(() => validateDailyBriefArguments(draft(`回看 ${open}2026${close}。`), withSample(sample))).toThrow();
    expect(() => validateDailyBriefArguments(draft(text), facts)).toThrow();
    const ambiguous = withSample(sample);
    ambiguous.find((fact) => fact.id === 'note_created_today').samples = [sample];
    expect(() => validateDailyBriefArguments({ ...draft('处理待办'), headline: text }, ambiguous)).toThrow();
  });

  it('同一次平台修复获得所有字段的数字问题，而不是只看到首个失败字段', async () => {
    vi.mocked(requestAi).mockReset();
    const bad = {
      headline: '今天 1 项重点',
      insights: [
        { factIds: ['todo_due_today'], text: '有 99 项待办。' },
        { factIds: ['note_created_today'], text: 'Read two notes.' },
      ],
      recommendation: '预计提升 3.5%。',
    };
    const response = (args) => ({
      content: '',
      toolCalls: [
        {
          function: {
            name: 'submit_daily_brief_narrative',
            arguments: JSON.stringify(args),
          },
        },
      ],
    });
    vi.mocked(requestAi)
      .mockResolvedValueOnce(response(bad))
      .mockImplementationOnce(async (messages) => {
        const diagnostic = JSON.parse(messages.at(-1).content.split('\n').at(-1));
        expect(diagnostic.fieldIssues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ field: 'headline', numericLiterals: ['1'] }),
            expect.objectContaining({ field: 'recommendation', numericLiterals: ['3.5'] }),
            expect.objectContaining({
              field: 'insights[0].text',
              numericLiterals: ['99'],
              allowedPlaceholders: ['{{todo_due_today.count}}', '{{todo_due_today.sample}}'],
            }),
            expect.objectContaining({
              field: 'insights[1].text',
              numericLiterals: ['two'],
              allowedPlaceholders: ['{{note_created_today.count}}'],
            }),
          ]),
        );
        expect(diagnostic.fieldIssues).toHaveLength(4);
        return response(draft('处理 {{todo_due_today.count}} 项待办。'));
      });
    const input = validateDailyBriefInput({ date: '2026-09-07', timezone: 'Asia/Shanghai', locale: 'zh-CN', facts });
    const prepared = await routineDailyBriefSkill.prepare({ input });
    await expect(
      callStructuredSkillModel({ ...prepared, modelPolicy: routineDailyBriefSkill.modelPolicy }),
    ).resolves.toMatchObject({ insights: [{ text: '处理 {{todo_due_today.count}} 项待办。' }] });
    expect(requestAi).toHaveBeenCalledTimes(2);
    expect(vi.mocked(requestAi).mock.calls[1][1].billingScope).toBe('platform');
  });

  it('不归一化部分标题、未声明来源或存在歧义的来源', () => {
    expect(() => validateDailyBriefArguments(draft('先处理《2026 年》。'), withSample('2026 年复盘'))).toThrow();
    const scopedFacts = withSample('2026 年复盘');
    scopedFacts.find((fact) => fact.id === 'note_created_today').samples = ['其他 2026 资料'];
    expect(() => validateDailyBriefArguments(draft('先处理《其他 2026 资料》。'), scopedFacts)).toThrow();
    scopedFacts.find((fact) => fact.id === 'note_created_today').samples = ['2026 年复盘'];
    expect(() =>
      validateDailyBriefArguments({ ...draft('先处理待办。'), headline: '回看《2026 年复盘》' }, scopedFacts),
    ).toThrow();
  });

  it('标题中的模板文字不递归展开，标题之外的错误数字仍被拦截', () => {
    const scopedFacts = withSample('2026 {{unknown.count}}');
    expect(validateDailyBriefArguments(draft('回看《2026 {{unknown.count}}》。'), scopedFacts).insights[0].text).toBe(
      '回看《{{todo_due_today.sample}}》。',
    );
    expect(() =>
      validateDailyBriefArguments(draft('回看《2026 {{unknown.count}}》，共 99 项。'), scopedFacts),
    ).toThrow();
  });

  it('带数字的新旧关联证据必须完整匹配后才归一化为顾的事实引用', () => {
    const connection = {
      id: 'resource_connection',
      count: 1,
      samples: ['近期的《2026 方案》与较早的《2025 计划》同属「装修」标签'],
    };
    const args = {
      ...draft(''),
      insights: [{ factIds: ['resource_connection'], text: `${connection.samples[0]}，可对照原资料。` }],
    };
    expect(validateDailyBriefArguments(args, [...facts, connection]).insights[0].text).toBe(
      '{{resource_connection.sample}}，可对照原资料。',
    );
    expect(() =>
      validateDailyBriefArguments(
        { ...args, insights: [{ factIds: ['resource_connection'], text: '《2026 方案》和《2025 计划》观点相同。' }] },
        [...facts, connection],
      ),
    ).toThrow();
  });

  it.each([true, false])('真实结构化链路最多修复一次，修复成功=%s', async (validRepair) => {
    vi.mocked(requestAi).mockReset();
    const response = (args) => ({
      content: '',
      toolCalls: [{ function: { name: 'submit_daily_brief_narrative', arguments: JSON.stringify(args) } }],
    });
    vi.mocked(requestAi)
      .mockResolvedValueOnce(response(draft('今天有 99 项待办。')))
      .mockResolvedValueOnce(
        response(draft(validRepair ? '今天有 {{todo_due_today.count}} 项待办。' : '今天有 99 项待办。')),
      );
    const input = validateDailyBriefInput({ date: '2026-09-05', timezone: 'Asia/Shanghai', locale: 'zh-CN', facts });
    const prepared = await routineDailyBriefSkill.prepare({ input });
    const operation = callStructuredSkillModel({
      ...prepared,
      modelPolicy: routineDailyBriefSkill.modelPolicy,
      trace: { stage: 'daily_brief' },
    });
    if (validRepair)
      await expect(operation).resolves.toMatchObject({
        insights: [{ text: '今天有 {{todo_due_today.count}} 项待办。' }],
      });
    else await expect(operation).rejects.toMatchObject({ code: 'AI_SKILL_DAILY_BRIEF_NUMERIC_CLAIM' });
    expect(requestAi).toHaveBeenCalledTimes(2);
    const [messages, options] = vi.mocked(requestAi).mock.calls[1];
    expect(messages.at(-1).content).toContain('insights[0].text');
    expect(messages.at(-1).content).toContain('今天有 99 项待办。');
    expect(messages.at(-1).content).toContain('{{todo_due_today.count}}');
    expect(options).toMatchObject({ billingScope: 'platform', repairReasonCode: 'AI_SKILL_DAILY_BRIEF_NUMERIC_CLAIM' });
  });

  it.each([
    ['TEXT_TOO_LONG', 'headline', { headline: '长'.repeat(81) }],
    ['TEXT_EMPTY', 'recommendation', { recommendation: '' }],
    ['TOKEN_SYNTAX', 'headline', { headline: '{{todo_due_today.total}}' }],
    ['TOKEN_UNKNOWN_FACT', 'headline', { headline: '{{unknown.count}}' }],
    ['TOKEN_SAMPLE_UNAVAILABLE', 'headline', { headline: '{{note_created_today.sample}}' }],
    [
      'TOKEN_UNDECLARED_FACT',
      'insights[0].text',
      { insights: [{ factIds: ['todo_due_today'], text: '{{note_created_today.count}}' }] },
    ],
    ['FACT_IDS_INVALID', 'insights[0].factIds', { insights: [{ factIds: ['unknown'], text: '回看资料' }] }],
    ['INSIGHTS_SHAPE', 'insights', { insights: [] }],
    ['INSIGHT_SHAPE', 'insights[0]', { insights: [{ factIds: ['todo_due_today'], text: '回看资料', extra: true }] }],
    ['DRAFT_SHAPE', 'draft', { extra: true }],
    ['POSITIVE_FACT_REQUIRED', 'insights', { insights: [{ factIds: ['todo_overdue'], text: '没有逾期' }] }],
  ])('结构失败 %s 提供具体字段和完整草稿，并通过既有单次修复链路', async (reason, field, patch) => {
    const invalid = { ...draft('先处理待办。'), ...patch };
    expect(() => validateDailyBriefArguments(invalid, facts)).toThrowError(
      expect.objectContaining({
        code: 'AI_SKILL_DAILY_BRIEF_OUTPUT_INVALID',
        details: expect.objectContaining({ reason, field }),
      }),
    );
    vi.mocked(requestAi).mockReset();
    const response = (args) => ({
      content: '',
      toolCalls: [{ function: { name: 'submit_daily_brief_narrative', arguments: JSON.stringify(args) } }],
    });
    vi.mocked(requestAi)
      .mockResolvedValueOnce(response(invalid))
      .mockResolvedValueOnce(response(draft('先处理待办。')));
    const input = validateDailyBriefInput({ date: '2026-09-05', timezone: 'Asia/Shanghai', locale: 'zh-CN', facts });
    const prepared = await routineDailyBriefSkill.prepare({ input });
    await expect(
      callStructuredSkillModel({ ...prepared, modelPolicy: routineDailyBriefSkill.modelPolicy }),
    ).resolves.toMatchObject({ headline: '先处理重点' });
    const repairMessage = vi.mocked(requestAi).mock.calls[1][0].at(-1).content;
    expect(repairMessage).toContain(reason);
    expect(repairMessage).toContain(field);
    expect(repairMessage).toContain(JSON.stringify(invalid));
    expect(requestAi).toHaveBeenCalledTimes(2);
  });

  it('结构错误修复再次失败就终止，保留最终精确诊断，不进行第三次调用', async () => {
    vi.mocked(requestAi).mockReset();
    const invalid = { ...draft('先处理待办。'), recommendation: '长'.repeat(161) };
    vi.mocked(requestAi).mockResolvedValue({
      content: '',
      toolCalls: [{ function: { name: 'submit_daily_brief_narrative', arguments: JSON.stringify(invalid) } }],
    });
    const input = validateDailyBriefInput({ date: '2026-09-05', timezone: 'Asia/Shanghai', locale: 'en-US', facts });
    const prepared = await routineDailyBriefSkill.prepare({ input });
    await expect(
      callStructuredSkillModel({ ...prepared, modelPolicy: routineDailyBriefSkill.modelPolicy }),
    ).rejects.toMatchObject({
      details: { reason: 'TEXT_TOO_LONG', field: 'recommendation', actualLength: 161, maxLength: 160 },
    });
    expect(requestAi).toHaveBeenCalledTimes(2);
    expect(vi.mocked(requestAi).mock.calls[1][0].at(-1).content).toContain(
      'counting each fact placeholder as ONE reference character',
    );
  });

  it('允许可选关联事实，必须引用已核验的依据，不能凭空补顾', () => {
    const connection = {
      id: 'resource_connection',
      label: '关联',
      count: 1,
      route: '/tag/t',
      samples: ['新旧资料同属装修标签'],
    };
    const input = { date: '2026-09-05', timezone: 'Asia/Shanghai', locale: 'zh-CN', facts: [...facts, connection] };
    expect(validateDailyBriefInput(input).facts).toHaveLength(11);
    const args = {
      headline: '可以对照既有资料',
      insights: [{ factIds: ['resource_connection'], text: '{{resource_connection.sample}}，可以打开原资料对照。' }],
      recommendation: '先核对原资料，再决定是否补充。',
    };
    expect(validateDailyBriefArguments(args, input.facts).insights).toHaveLength(1);
    expect(() => validateDailyBriefArguments(args, facts)).toThrow();
    expect(() => validateDailyBriefArguments(args, [...facts, { ...connection, count: 0, samples: [] }])).toThrow();
    expect(() =>
      validateDailyBriefArguments(
        { ...args, insights: [{ factIds: ['resource_connection'], text: '这些资料存在矛盾。' }] },
        input.facts,
      ),
    ).toThrow();
  });
  it('按紧急行动、关联、近期新增排序，过滤独立零值与未变整理提醒', () => {
    const current = facts.map((fact) => ({ ...fact, count: fact.id === 'todo_due_today' ? 0 : 1 }));
    current.push({ id: 'resource_connection', label: '关联', count: 1, route: '/tag/t', samples: ['共享标签'] });
    const args = {
      headline: '先处理紧急行动',
      recommendation: '完成后可核对新旧资料。',
      insights: [
        { factIds: ['organize_untagged'], text: '有 {{organize_untagged.count}} 项待整理。' },
        { factIds: ['note_created_today'], text: '今天新增 {{note_created_today.count}} 篇笔记。' },
        { factIds: ['todo_due_today'], text: '今天没有到期待办。' },
        { factIds: ['resource_connection'], text: '{{resource_connection.sample}}，可以对照阅读。' },
        { factIds: ['todo_overdue'], text: '先完成 {{todo_overdue.count}} 项逾期待办。' },
      ],
    };
    expect(
      validateDailyBriefArguments(args, current, ['organize_untagged']).insights.map((item) => item.factIds[0]),
    ).toEqual(['todo_overdue', 'resource_connection', 'note_created_today']);
    expect(
      validateDailyBriefArguments({ ...args, insights: [args.insights[0]] }, current, ['organize_untagged']).insights,
    ).toHaveLength(1);
  });
  it('只接受服务端固定的完整事实集合', () => {
    expect(
      validateDailyBriefInput({ date: '2026-09-04', timezone: 'Asia/Shanghai', locale: 'zh-CN', facts }),
    ).toMatchObject({ date: '2026-09-04', facts });
    expect(() =>
      validateDailyBriefInput({
        date: '2026-09-04',
        timezone: 'Asia/Shanghai',
        locale: 'zh-CN',
        facts: facts.slice(0, -1),
      }),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_DAILY_BRIEF_FACTS_INVALID' }));
  });

  it('模型用事实占位符生成洞察，且不能自行声称数字', () => {
    expect(
      validateDailyBriefArguments(
        {
          headline: '先处理最紧要的事项',
          insights: [
            {
              factIds: ['todo_due_today'],
              text: '今天有 {{todo_due_today.count}} 项待办等待推进，可以先处理“{{todo_due_today.sample}}”。',
            },
          ],
          recommendation: '完成行动后再整理资料',
        },
        facts,
      ),
    ).toMatchObject({ kind: 'structured_draft', insights: [{ factIds: ['todo_due_today'] }] });
    expect(() =>
      validateDailyBriefArguments(
        {
          headline: '今天有 3 项',
          insights: [{ factIds: ['todo_due_today'], text: '先处理 {{todo_due_today.count}} 项待办。' }],
          recommendation: '先行动',
        },
        facts,
      ),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_DAILY_BRIEF_NUMERIC_CLAIM' }));
    expect(() =>
      validateDailyBriefArguments(
        {
          headline: 'Focus on one urgent item',
          insights: [{ factIds: ['todo_due_today'], text: 'Handle {{todo_due_today.count}} due items.' }],
          recommendation: 'Handle it first',
        },
        facts,
      ),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_DAILY_BRIEF_NUMERIC_CLAIM' }));
    expect(() =>
      validateDailyBriefArguments(
        {
          headline: '先行动',
          insights: [{ factIds: ['todo_due_today'], text: '先处理 {{unknown.count}} 项内容。' }],
          recommendation: '先行动',
        },
        facts,
      ),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_DAILY_BRIEF_OUTPUT_INVALID' }));
  });

  it('有正数事实时不允许洞察引用零数量事实，全零时仍可生成中性建议', () => {
    expect(() =>
      validateDailyBriefArguments(
        {
          headline: '先处理重点',
          insights: [{ factIds: ['todo_overdue'], text: '先看需要处理的事项。' }],
          recommendation: '按当前节奏继续',
        },
        facts,
      ),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_DAILY_BRIEF_OUTPUT_INVALID' }));
    expect(
      validateDailyBriefArguments(
        {
          headline: '今日稳步推进',
          insights: [{ factIds: ['todo_overdue'], text: '今天没有积压，可以按自己的节奏推进。' }],
          recommendation: '按当前节奏继续',
        },
        facts.map((fact) => ({ ...fact, count: 0 })),
      ),
    ).toMatchObject({ insights: [{ factIds: ['todo_overdue'] }] });
  });

  it('是 internal-only Skill，并使用结构化工具而不是自由文本', async () => {
    const callStructuredSkillModel = vi.fn();
    const input = validateDailyBriefInput({ date: '2026-09-04', timezone: 'Asia/Shanghai', locale: 'zh-CN', facts });
    const prepared = await routineDailyBriefSkill.prepare({ input, dependencies: { callStructuredSkillModel } });
    expect(routineDailyBriefSkill).toMatchObject({
      internalOnly: true,
      allowedInternalCallers: ['daily_brief_service'],
    });
    expect(prepared.callModel).toBe(callStructuredSkillModel);
    expect(prepared.structuredTool.name).toBe('submit_daily_brief_narrative');
  });

  it('按账号语言约束模型只生成对应语言的叙述', async () => {
    const input = validateDailyBriefInput({ date: '2026-09-04', timezone: 'Asia/Shanghai', locale: 'en-US', facts });
    const prepared = await routineDailyBriefSkill.prepare({
      input,
      dependencies: { callStructuredSkillModel: vi.fn() },
    });
    expect(prepared.messages[0].content).toContain('in English');
  });

  it('通过真实 Skill runtime 校验 locale、结构化结果并在返回前执行交付钩子', async () => {
    const englishFacts = facts.map((fact) => ({ ...fact, label: `English ${fact.id}` }));
    const commitValidatedResult = vi.fn().mockResolvedValue(undefined);
    const callStructuredSkillModel = vi.fn(async ({ validateArguments }) =>
      validateArguments({
        headline: 'Focus on urgent work',
        insights: [
          {
            factIds: ['todo_due_today'],
            text: 'There are {{todo_due_today.count}} due items worth handling first.',
          },
        ],
        recommendation: 'Handle urgent work before organizing notes',
      }),
    );
    const request = {
      protocolVersion: 1,
      requestId: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
      skillId: 'routine.daily_brief',
      skillVersion: 1,
      threadId: null,
      input: { date: '2026-09-04', timezone: 'Asia/Shanghai', locale: 'en-US', facts: englishFacts },
      scope: { resourceRefs: [] },
      client: { locale: 'en-US', timezone: 'Asia/Shanghai', surface: 'desktop_workbench' },
    };
    const dependencies = {
      internalCaller: 'daily_brief_service',
      assertDomainEnabled: () => {},
      resolveContext: async () => ({
        identity: {
          actorUserId: 'user-1',
          subjectUserId: 'user-1',
          actorRole: 'user',
          adminContextMode: 'normal',
          adminContextId: null,
        },
        resourceRefs: [],
        scopeDigest: 'a'.repeat(64),
      }),
      resolveThread: async () => null,
      appendTurn: vi.fn(),
      runExecution: async (_config, operation) => operation(),
      skillDependencies: { callStructuredSkillModel },
      commitValidatedResult,
    };

    await expect(
      executeAiSkill(request, { user: { id: 'user-1', role: 'user' } }, dependencies),
    ).resolves.toMatchObject({
      status: 'completed',
      result: { headline: 'Focus on urgent work', insights: [{ factIds: ['todo_due_today'] }] },
    });
    expect(callStructuredSkillModel).toHaveBeenCalledOnce();
    expect(commitValidatedResult).toHaveBeenCalledOnce();
    expect(commitValidatedResult.mock.calls[0][0]).toMatchObject({ input: { locale: 'en-US' } });

    const { locale: _locale, ...inputWithoutLocale } = request.input;
    await expect(
      executeAiSkill(
        { ...request, requestId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', input: inputWithoutLocale },
        { user: { id: 'user-1', role: 'user' } },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: 'AI_SKILL_DAILY_BRIEF_FACTS_INVALID' });
  });
});
