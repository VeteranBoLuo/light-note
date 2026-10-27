import { describe, expect, it, vi } from 'vitest';
import routineDailyBriefSkill, {
  validateDailyBriefArguments,
  validateDailyBriefInput,
} from './routineDailyBriefSkill.js';
import { callStructuredSkillModel } from '../structuredModel.js';
import { requestAi } from '../../agent/aiGateway.js';
import { executeAiSkill } from '../runtime.js';
vi.mock('../../agent/aiGateway.js', () => ({ requestAi: vi.fn() }));
const fact = {
  id: 'workshop_result',
  label: '新成果',
  route: '/toolbox/task/job',
  count: 1,
  samples: ['资料未完整读取：主要结论来自已经读取的资料，请回到原成果核对。'],
};
const input = (facts = [fact]) => ({ date: '2026-10-22', timezone: 'Asia/Shanghai', locale: 'zh-CN', facts });
const draft = (text = '{{workshop_result.sample}}') => ({ insights: [{ factIds: ['workshop_result'], text }] });
const response = (value) => ({
  content: '',
  toolCalls: [{ function: { name: 'submit_daily_brief_narrative', arguments: JSON.stringify(value) } }],
});
describe('新成果简报 Skill', () => {
  it('允许没有补充洞察，不要求标题、建议或正数填充', async () => {
    const prepared = await routineDailyBriefSkill.prepare({ input: validateDailyBriefInput(input()) });
    expect(prepared.validateArguments({ insights: [] })).toMatchObject({ insights: [], writeCommitted: false });
    expect(prepared.structuredTool.parameters.properties.insights.minItems).toBe(0);
    expect(prepared.structuredTool.parameters.required).toEqual(['insights']);
    expect(() => prepared.validateArguments({ ...draft(), recommendation: '继续保持' })).toThrow();
  });
  it.each(['resource_connection', 'bookmark_created_today', 'organize_untagged', 'todo_due_today'])(
    '拒绝把 %s 重新送入模型凑内容',
    async (id) => {
      expect(() => validateDailyBriefInput(input([{ ...fact, id }]))).toThrow();
      const prepared = await routineDailyBriefSkill.prepare({ input: validateDailyBriefInput(input()) });
      expect(() => prepared.validateArguments({ insights: [{ factIds: [id], text: '有关联' }] })).toThrow();
    },
  );
  it('拒绝空结论、额外字段、零值和不完整事实', () => {
    for (const facts of [
      [],
      [{ ...fact, samples: [] }],
      [{ ...fact, count: 0 }],
      [{ ...fact, sources: [] }],
      [fact, fact],
    ])
      expect(() => validateDailyBriefInput(input(facts))).toThrow();
  });
  it('必须保留完整原结论，不能丢掉部分读取限制只给通用建议', () => {
    expect(validateDailyBriefArguments(draft(), [fact]).insights[0].text).toBe('{{workshop_result.sample}}');
    expect(() => validateDailyBriefArguments(draft('可以回看并整理资料。'), [fact])).toThrow(
      expect.objectContaining({ details: expect.objectContaining({ reason: 'RESULT_EVIDENCE_REQUIRED' }) }),
    );
  });
  it.each(['有 3 个结论，{{workshop_result.sample}}', 'There are three results. {{workshop_result.sample}}'])(
    '数字不能由模型自行编写：%s',
    (text) => {
      expect(() => validateDailyBriefArguments(draft(text), [fact])).toThrow(
        expect.objectContaining({ code: 'AI_SKILL_DAILY_BRIEF_NUMERIC_CLAIM' }),
      );
    },
  );
  it('完整有界的引用可归一为占位符，来源内部数字和模板字样不二次解释', () => {
    const f = { ...fact, samples: ['2026 方案与 {{workshop_result.count}} 文本'] };
    for (const text of [f.samples[0], `《${f.samples[0]}》`]) {
      const out = validateDailyBriefArguments(draft(text), [f]);
      expect(out.insights[0].text).toContain('{{workshop_result.sample}}');
    }
    expect(() => validateDailyBriefArguments(draft('2026 方案'), [f])).toThrow();
  });
  it('未知占位符、超长文本和多条输出均失败关闭', () => {
    for (const args of [
      draft('{{workshop_result.sample}} {{todo_due_today.count}}'),
      draft('长'.repeat(121) + '{{workshop_result.sample}}'),
      { insights: [...draft().insights, ...draft().insights] },
    ])
      expect(() => validateDailyBriefArguments(args, [fact])).toThrow();
  });
  it.each([true, false])('协议错误仅修复一次，修复成功=%s', async (ok) => {
    vi.mocked(requestAi).mockReset();
    const prepared = await routineDailyBriefSkill.prepare({ input: validateDailyBriefInput(input()) });
    const invalid = draft('有 99 个结论');
    vi.mocked(requestAi)
      .mockResolvedValueOnce(response(invalid))
      .mockResolvedValueOnce(response(ok ? { insights: [] } : invalid));
    const operation = callStructuredSkillModel({ ...prepared, modelPolicy: routineDailyBriefSkill.modelPolicy });
    if (ok) await expect(operation).resolves.toMatchObject({ insights: [] });
    else await expect(operation).rejects.toMatchObject({ code: 'AI_SKILL_DAILY_BRIEF_NUMERIC_CLAIM' });
    expect(requestAi).toHaveBeenCalledTimes(2);
    const [messages, options] = vi.mocked(requestAi).mock.calls[1];
    expect(messages.at(-1).content).toContain(JSON.stringify(invalid));
    expect(options.billingScope).toBe('platform');
  });
});

it.each([false, true])('通过真实 Skill runtime 校验语言、内部调用与交付钩子，建议=%s', async (advice) => {
  const commitValidatedResult = vi.fn();
  const callStructuredSkillModel = vi.fn(async ({ validateArguments }) =>
    validateArguments({ insights: [], ...(advice ? { recommendation: null } : {}) }),
  );
  const request = {
    protocolVersion: 1,
    requestId: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
    skillId: 'routine.daily_brief',
    skillVersion: 2,
    threadId: null,
    input: {
      ...input(),
      locale: 'en-US',
      ...(advice
        ? {
            facts: [],
            evidence: [
              {
                key: 'material_1',
                title: 'Export notes',
                excerpt: 'Offline exports include text only. Attachments require separate backup.',
              },
            ],
            body: ['Resources await organizing.'],
          }
        : {}),
    },
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
  expect(await executeAiSkill(request, { user: { id: 'user-1', role: 'user' } }, dependencies)).toMatchObject({
    status: 'completed',
    result: { insights: [] },
  });
  expect(commitValidatedResult).toHaveBeenCalledOnce();
  expect(callStructuredSkillModel.mock.calls[0][0].messages[0].content).toContain(
    advice ? 'No workshop result is supplied' : 'Write one concise update',
  );
  const { locale, ...missingLocale } = request.input;
  await expect(
    executeAiSkill({ ...request, input: missingLocale }, { user: { id: 'user-1', role: 'user' } }, dependencies),
  ).rejects.toMatchObject({ code: 'AI_SKILL_DAILY_BRIEF_FACTS_INVALID' });
});

it.each(['valid', 'empty', 'invalid'])('建议引用错误只修复一次，结果=%s', async (outcome) => {
  vi.mocked(requestAi).mockReset();
  const prepared = await routineDailyBriefSkill.prepare({
    input: validateDailyBriefInput({
      ...input([]),
      evidence: [
        {
          key: 'material_1',
          title: '导出说明',
          excerpt: '导出只包含正文，附件需要单独备份。页面应说明导出范围和附件备份方式。',
        },
      ],
      body: [],
    }),
  });
  const proposal = {
    sourceKey: 'material_1',
    quote: '导出只包含正文，附件需要单独备份',
    action: '建议在导出验收清单加入附件备份检查，核对页面是否说明这一限制。',
  };
  const invalid = { insights: [], recommendation: { ...proposal, quote: '这是一段资料里没有的虚构引用文字' } };
  vi.mocked(requestAi)
    .mockResolvedValueOnce(response(invalid))
    .mockResolvedValueOnce(
      response(
        outcome === 'invalid' ? invalid : { insights: [], recommendation: outcome === 'empty' ? null : proposal },
      ),
    );
  const operation = callStructuredSkillModel({
    ...prepared,
    modelPolicy: routineDailyBriefSkill.resolveModelPolicy({ evidence: [{}] }),
  });
  if (outcome === 'invalid')
    await expect(operation).rejects.toMatchObject({
      code: 'AI_SKILL_DAILY_BRIEF_OUTPUT_INVALID',
      details: { reason: 'ADVICE_QUOTE_NOT_FOUND' },
    });
  else await expect(operation).resolves.toMatchObject({ recommendation: outcome === 'empty' ? null : proposal });
  expect(requestAi).toHaveBeenCalledTimes(2);
  expect(requestAi.mock.calls[1][0].at(-1).content).toContain('ADVICE_QUOTE_NOT_FOUND');
  expect(requestAi.mock.calls[1][1].billingScope).toBe('platform');
});

it.each(['zh-CN', 'en-US'])('正文身份不能给建议补证据，正常返回空判断且不增加修复调用：%s', async (locale) => {
  const english = locale === 'en-US';
  const sample = {
    key: 'material_1',
    title: english ? 'Brief feedback' : '工作台反馈',
    excerpt: english
      ? 'The brief should prioritize reminders ahead of statistics.'
      : '简报没有重点，今天有待办时应该把提醒放在前面。',
  };
  const recommendation = {
    sourceKey: sample.key,
    quote: sample.excerpt,
    action: english
      ? 'Consider moving Check in into a section ahead of the organizing statistics.'
      : '可考虑在简报开头单列今日待办，把例行签到提醒放在最前面。',
  };
  const prepared = await routineDailyBriefSkill.prepare({
    input: validateDailyBriefInput({
      ...input([]),
      locale,
      evidence: [sample],
      body: [english ? '“Check in” has a reminder set.' : '今天留意一下「例行签到」：已设置提醒，目前仍待完成。'],
    }),
  });
  vi.mocked(requestAi)
    .mockReset()
    .mockResolvedValueOnce(response({ insights: [], recommendation }));
  expect(
    await callStructuredSkillModel({
      ...prepared,
      modelPolicy: routineDailyBriefSkill.resolveModelPolicy({ evidence: [sample] }),
    }),
  ).toMatchObject({ recommendation: null });
  expect(requestAi).toHaveBeenCalledTimes(1);
  expect(routineDailyBriefSkill.resolveModelPolicy({ evidence: [sample] }).maxTokens).toBe(900);
});

it('admits grounded applications without requiring a defect and keeps the existing evidence/output budgets', async () => {
  const inputData = { ...input([]), evidence: [{ key: 'material_1', title: '阅读方法', excerpt: '阅读时区分作者主张和支持主张的证据，复述时保留二者的对应关系。' }], body: [] };
  const prepared = await routineDailyBriefSkill.prepare({ input: inputData });
  const system = prepared.messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
  expect(system).toContain('不要求资料先暴露问题或缺陷');
  expect(system).toContain('精确原文短引文');
  expect(routineDailyBriefSkill.resolveModelPolicy(inputData).maxTokens).toBe(900);
  expect(prepared.validateArguments({ insights: [], recommendation: { sourceKey: 'material_1', quote: '区分作者主张和支持主张的证据', action: '可以选用这篇资料中的主张，分别标出对应证据，再核对复述是否保持二者的关系。' } }).recommendation).not.toBeNull();
});
