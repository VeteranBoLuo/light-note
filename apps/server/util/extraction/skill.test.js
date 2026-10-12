import { describe, it, expect, vi } from 'vitest';
import { resolveAiSkill, listAiSkills } from '../aiSkill/registry.js';
import { executeAiSkill } from '../aiSkill/runtime.js';
import { createAiSkillExecutionConfig } from '../aiBillingCatalog.js';
import { validatePlan } from './contract.js';
const source = {
  id: 'server-source',
  version: 'v1',
  title: '产品',
  complete: true,
  coverage: {},
  segments: [{ id: 's1', kind: 'original', locator: '段落', text: '相机甲 重量 3 g' }],
};
const plan = validatePlan({
  recordDefinition: '每个产品',
  fields: [{ key: 'weight', label: '重量', type: 'text', rule: '含单位' }],
});
describe('正式提取 Skill 契约', () => {
  it('完整 Runtime 接收提取结果，在结束 Execution 前提交已校验结果', async () => {
    const committed = vi.fn(),
      events = [];
    const result = await executeAiSkill(
      {
        protocolVersion: 1,
        requestId: '35d632d9-625b-4f63-bda3-cf39b9d04dd0',
        skillId: 'toolbox.extraction_extract',
        skillVersion: 1,
        input: { source, goal: '', plan },
        scope: { resourceRefs: [] },
        client: { surface: 'toolbox', locale: 'zh-CN', timezone: 'Asia/Shanghai' },
      },
      { user: { id: 'u', role: 'user' } },
      {
        internalCaller: 'extraction_worker',
        assertDomainEnabled: vi.fn(),
        recordTelemetry: vi.fn(),
        resolveContext: async () => ({
          identity: { actorUserId: 'u', subjectUserId: 'u' },
          resourceRefs: [],
          scopeDigest: 'a'.repeat(64),
        }),
        resolveThread: async () => null,
        appendTurn: vi.fn(),
        runExecution: async (_config, work) => {
          const value = await work();
          events.push('settle');
          return value;
        },
        skillDependencies: {
          callStructuredSkillModel: async (config) =>
            config.validateArguments({
              complete: true,
              records: [
                {
                  anchor: { segment: 0, quote: '相机甲' },
                  cells: [{ value: '3 g', status: 'found', evidence: [{ segment: 0, quote: '相机甲 重量 3 g' }] }],
                },
              ],
            }),
        },
        commitValidatedResult: async ({ response }) => {
          committed(response);
          events.push('commit');
        },
      },
    );
    expect(result.result.records[0].cells[0].originalValue).toBe('3 g');
    expect(committed).toHaveBeenCalledOnce();
    expect(events).toEqual(['commit', 'settle']);
  });
  it('只向可信 Worker 开放，且只使用用户 AI 额度', async () => {
    for (const mode of ['suggest', 'extract']) {
      const id = `toolbox.extraction_${mode}`,
        skill = resolveAiSkill(id, 1);
      expect(listAiSkills({ includeInternal: false }).some((s) => s.id === id)).toBe(false);
      const request = {
        protocolVersion: 1,
        requestId: '35d632d9-625b-4f63-bda3-cf39b9d04dd0',
        skillId: id,
        skillVersion: 1,
        input: { source, goal: '', plan },
        scope: { resourceRefs: [] },
        client: { surface: 'toolbox', locale: 'zh-CN', timezone: 'Asia/Shanghai' },
      };
      await expect(
        executeAiSkill(request, { user: { id: 'u', role: 'user' } }, { recordTelemetry: vi.fn() }),
      ).rejects.toMatchObject({ code: 'AI_SKILL_INTERNAL_ONLY' });
      expect(createAiSkillExecutionConfig(skill, request).billingPolicy).toBe('user');
      expect(() => createAiSkillExecutionConfig(skill, request, { billingPolicy: 'system' })).toThrow('额度策略');
    }
  });
  it('不把不完整输出标成成功，不自动修复/重发付费调用', async () => {
    const skill = resolveAiSkill('toolbox.extraction_extract', 1),
      invoke = vi.fn(async (config) => {
        expect(config.repairableErrorCodes).toEqual([]);
        return config.validateArguments({ complete: false, records: [] });
      });
    const prepared = await skill.prepare({
      input: { source, plan, goal: '' },
      dependencies: { callStructuredSkillModel: invoke },
    });
    await expect(prepared.callModel({ modelPolicy: skill.modelPolicy })).rejects.toMatchObject({
      code: 'EXTRACTION_OUTPUT_INCOMPLETE',
    });
    expect(invoke).toHaveBeenCalledOnce();
  });
  it('将稳定来源与证据绑定到正式结果，不接受模型注入 owner', async () => {
    const skill = resolveAiSkill('toolbox.extraction_extract', 1),
      invoke = async (config) =>
        config.validateArguments({
          complete: true,
          records: [
            {
              anchor: { segment: 0, quote: '相机甲' },
              cells: [{ value: '3 g', status: 'found', evidence: [{ segment: 0, quote: '相机甲 重量 3 g' }] }],
            },
          ],
        });
    const prepared = await skill.prepare({
      input: { source, plan, goal: '' },
      dependencies: { callStructuredSkillModel: invoke },
    });
    const result = await prepared.callModel({ modelPolicy: skill.modelPolicy });
    expect(result.kind).toBe('structured_draft');
    expect(result.records[0].cells[0].evidence[0]).toMatchObject({
      sourceId: 'server-source',
      sourceVersion: 'v1',
      kind: 'original',
    });
  });
});
