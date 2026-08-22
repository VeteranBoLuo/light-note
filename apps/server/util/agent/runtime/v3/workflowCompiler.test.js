import { describe, expect, it, vi } from 'vitest';
import { compileDeterministicAgentWorkflow } from './workflowCompiler.js';

function fixture({ deterministic = true, slotClaims = {}, required = false } = {}) {
  const tool = {
    name: 'query_notes',
    parameters: { type: 'object', additionalProperties: false, properties: {} },
  };
  const capability = {
    id: 'note.query',
    resultKind: 'note_list',
    workflow: { kind: 'single_tool', deterministic },
    temporalSlots: [],
    slots: [{ name: 'keyword', source: 'model_text', required, maxLength: 100 }],
  };
  const turnSpec = {
    digest: 'semantic-digest',
    goals: [
      {
        id: 'query-notes',
        dependsOn: [],
        slotClaims,
      },
    ],
  };
  const route = {
    state: 'ready',
    candidates: [tool],
    goalRoutes: [{ goalId: 'query-notes', status: 'ready', toolNames: ['query_notes'] }],
    capabilityByTool: new Map([['query_notes', capability]]),
  };
  return { turnSpec, route };
}

describe('Agent V3 deterministic workflow compiler', () => {
  it('只有 Manifest 显式开启且统一 Validator 通过时生成零模型步骤', () => {
    const validate = vi.fn().mockReturnValue({ valid: true, issues: [], toolCalls: [] });
    const result = compileDeterministicAgentWorkflow({ ...fixture({ slotClaims: { keyword: '项目' } }), validate });

    expect(result).toMatchObject({ applicable: true, planningMode: 'deterministic', attempts: 0 });
    expect(result.plan.steps).toEqual([
      expect.objectContaining({
        id: 'wf-query-notes',
        goalId: 'query-notes',
        toolName: 'query_notes',
        arguments: { keyword: '项目' },
        expectedResultKind: 'note_list',
      }),
    ]);
    expect(validate).toHaveBeenCalledOnce();
  });

  it('未迁移能力或确定性参数校验失败时只回退 Planner，不生成半截计划', () => {
    expect(compileDeterministicAgentWorkflow(fixture({ deterministic: false }))).toEqual({
      applicable: false,
      reason: 'workflow_requires_planner',
    });

    const validation = { valid: false, issues: ['TOOL_ARGUMENT_REQUIRED'], toolCalls: [] };
    expect(
      compileDeterministicAgentWorkflow({
        ...fixture({ slotClaims: { keyword: '项目' } }),
        validate: vi.fn().mockReturnValue(validation),
      }),
    ).toEqual({
      applicable: false,
      reason: 'deterministic_validation_failed',
      validation,
    });
  });

  it('拒绝把未在 Manifest 声明的 claim 变成工具参数', () => {
    expect(
      compileDeterministicAgentWorkflow({
        ...fixture({ slotClaims: { resourceId: 'client-made-id' } }),
        validate: vi.fn(),
      }),
    ).toEqual({ applicable: false, reason: 'workflow_slot_contract_mismatch' });
  });

  it('可选槽显式为空可继续，必填槽显式为空必须进入受限补槽阶段', () => {
    const validate = vi.fn().mockReturnValue({ valid: true, issues: [], toolCalls: [] });
    expect(
      compileDeterministicAgentWorkflow({ ...fixture({ slotClaims: { keyword: null } }), validate }),
    ).toMatchObject({ applicable: true, planningMode: 'deterministic' });
    expect(
      compileDeterministicAgentWorkflow({
        ...fixture({ slotClaims: { keyword: null }, required: true }),
        validate,
      }),
    ).toEqual({ applicable: false, reason: 'workflow_model_slots_unresolved' });
  });
});
