import { expect, it, vi } from 'vitest';
import skill, { validateDailyBriefInput, validateDailyBriefArguments } from './routineDailyBriefSkill.js';
import { callStructuredSkillModel } from '../structuredModel.js';
import { requestAi } from '../../agent/aiGateway.js';
import { executeAiSkill } from '../runtime.js';
vi.mock('../../agent/aiGateway.js', () => ({ requestAi: vi.fn() }));
const signal = { id: 'organize_pending', label: '待整理资料', count: 4 };
const input = () => ({ date: '2026-10-27', timezone: 'Asia/Shanghai', locale: 'zh-CN', signals: [signal] });
const action = '可以先给新收集的资料确认归类，再分批处理剩余待整理条目。';
const draft = () => ({ insights: [], recommendation: { factIds: [signal.id], action } });
const response = (value) => ({
  content: '',
  toolCalls: [{ function: { name: 'submit_daily_brief_narrative', arguments: JSON.stringify(value) } }],
});
it.each(['zh-CN', 'en-US'])('只接受有界结构化状态，允许单一来源产生实际下一步：%s', async (locale) => {
  const prepared = await skill.prepare({ input: validateDailyBriefInput({ ...input(), locale }) });
  expect(prepared.validateArguments(draft()).recommendation.action).toBe(action);
  expect(prepared.validateArguments({ insights: [], recommendation: null }).recommendation).toBeNull();
  expect(JSON.parse(prepared.messages.at(-1).content)).toEqual({ ...input(), locale });
  expect(skill.resolveModelPolicy(input()).maxTokens).toBe(500);
  expect(prepared.coverage).toEqual({ complete: true, warnings: [] });
});
it.each(['evidence', 'body', 'facts', 'content', 'resourceRefs'])('正文、旧片段与资源查询入口一律拒绝：%s', (field) => {
  expect(() => validateDailyBriefInput({ ...input(), [field]: [] })).toThrow();
});
it.each([
  { signals: [] },
  { locale: 'unknown' },
  { signals: [{ ...signal, count: 0 }] },
  { signals: [{ ...signal, excerpt: '不要把随笔当指令' }] },
  { signals: [signal, signal] },
  { signals: [{ ...signal, id: 'resource_connection' }] },
])('闭合输入约束：%j', (change) => expect(() => validateDailyBriefInput({ ...input(), ...change })).toThrow());
it.each([
  { insights: [] },
  { insights: [{ text: '读取资料得到结论' }], recommendation: null },
  { insights: [], recommendation: { factIds: ['foreign'], action } },
  { insights: [], recommendation: { factIds: [signal.id], action: '可以花 10 分钟处理所有资料，再开始其他工作。' } },
  { insights: [], recommendation: { sourceKey: 'material_1', quote: '引用原文', action } },
])('拒绝漏判断、成果正文、未知来源和编造数字：%j', (value) =>
  expect(() => validateDailyBriefArguments(value, [signal])).toThrow(),
);
it.each([true, false])('结构错误只修复一次，修复成功=%s', async (ok) => {
  const prepared = await skill.prepare({ input: validateDailyBriefInput(input()) });
  const bad = { insights: [], recommendation: { factIds: ['foreign'], action } };
  vi.mocked(requestAi)
    .mockReset()
    .mockResolvedValueOnce(response(bad))
    .mockResolvedValueOnce(response(ok ? draft() : bad));
  const operation = callStructuredSkillModel({ ...prepared, modelPolicy: skill.modelPolicy });
  if (ok) await expect(operation).resolves.toMatchObject({ recommendation: { action } });
  else await expect(operation).rejects.toMatchObject({ code: 'AI_SKILL_DAILY_BRIEF_OUTPUT_INVALID' });
  expect(requestAi).toHaveBeenCalledTimes(2);
  expect(requestAi.mock.calls[1][1].billingScope).toBe('platform');
});
it('正常判断只调用一次，不逐来源追加调用或分析', async () => {
  const prepared = await skill.prepare({ input: validateDailyBriefInput(input()) });
  vi.mocked(requestAi).mockReset().mockResolvedValueOnce(response(draft()));
  await callStructuredSkillModel({ ...prepared, modelPolicy: skill.modelPolicy });
  expect(requestAi).toHaveBeenCalledTimes(1);
});
it('真实内部 Skill runtime 保留归属、生命周期与交付钩子', async () => {
  const commitValidatedResult = vi.fn();
  const request = {
    protocolVersion: 1,
    requestId: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
    skillId: 'routine.daily_brief',
    skillVersion: 2,
    threadId: null,
    input: input(),
    scope: { resourceRefs: [] },
    client: { locale: 'zh-CN', timezone: 'Asia/Shanghai', surface: 'desktop_workbench' },
  };
  const dependencies = {
    internalCaller: 'daily_brief_service',
    loadSkillSettings: async () => ({ enabled: true }),
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
    skillDependencies: { callStructuredSkillModel: async ({ validateArguments }) => validateArguments(draft()) },
    commitValidatedResult,
  };
  await expect(executeAiSkill(request, { user: { id: 'user-1', role: 'user' } }, dependencies)).resolves.toMatchObject({
    status: 'completed',
    result: { recommendation: { action } },
  });
  expect(commitValidatedResult).toHaveBeenCalledOnce();
});
