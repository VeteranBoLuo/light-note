import { describe, expect, it, vi } from 'vitest';
import { runAgentRuntimeV3 } from './agentRuntime.js';

const turnSpec = {
  version: '3.0',
  digest: 'digest-v3',
  requestKind: 'answer',
  confidence: 'high',
  continuationMode: 'refer_last_result',
  topicEpochAction: 'keep',
  groundingPolicy: 'workspace_query',
  temporalConstraints: [],
  outputContract: null,
  missingSlots: [],
  clarificationQuestion: '',
  goals: [
    {
      id: 'read',
      kind: 'read',
      capabilityId: 'note.read',
      capabilityDomain: 'note',
      operation: 'read',
      dependsOn: [],
    },
  ],
};

describe('Agent Runtime V3', () => {
  it('Manifest 确定性工作流通过统一门禁时跳过 Execution Planner', async () => {
    const deterministicSpec = {
      ...turnSpec,
      continuationMode: 'independent',
      goals: [
        {
          ...turnSpec.goals[0],
          capabilityId: 'account.profile.read',
          capabilityDomain: 'account',
          slotClaims: {},
        },
      ],
    };
    const tool = {
      name: 'get_user_info',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
    };
    const capability = {
      id: 'account.profile.read',
      resultKind: 'account_profile',
      workflow: { kind: 'single_tool', deterministic: true },
      temporalSlots: [],
    };
    const route = vi.fn().mockReturnValue({
      state: 'ready',
      candidates: [tool],
      goalRoutes: [
        {
          goalId: 'read',
          status: 'ready',
          capabilityIds: ['account.profile.read'],
          toolNames: ['get_user_info'],
        },
      ],
      capabilityByTool: new Map([['get_user_info', capability]]),
    });
    const plan = vi.fn();

    const result = await runAgentRuntimeV3({
      message: '查看我的账号信息',
      compile: vi.fn().mockResolvedValue({ turnSpec: deterministicSpec, attempts: 1 }),
      route,
      plan,
    });

    expect(result).toMatchObject({
      state: 'ready_for_tools',
      planningMode: 'deterministic',
      plannerAttempts: 0,
      toolCalls: [{ function: { name: 'get_user_info', arguments: '{}' } }],
    });
    expect(plan).not.toHaveBeenCalled();
  });

  it('缺少模型文字槽时只调用单目标 Slot Filler，成功后仍走统一计划门禁', async () => {
    const slotSpec = {
      ...turnSpec,
      version: '3.1',
      continuationMode: 'independent',
      goals: [{ ...turnSpec.goals[0], capabilityId: 'note.query', slotClaims: {} }],
    };
    const capability = {
      id: 'note.query',
      workflow: { kind: 'single_tool', deterministic: true },
      slots: [{ name: 'keyword', source: 'model_text', required: false }],
    };
    const route = vi.fn().mockReturnValue({
      state: 'ready',
      candidates: [{ name: 'query_notes' }],
      goalRoutes: [{ goalId: 'read', status: 'ready', toolNames: ['query_notes'] }],
      capabilityByTool: new Map([['query_notes', capability]]),
    });
    const compileWorkflow = vi
      .fn()
      .mockReturnValueOnce({ applicable: false, reason: 'workflow_model_slots_unresolved' })
      .mockReturnValueOnce({
        applicable: true,
        plan: { version: '2.0' },
        validation: {
          valid: true,
          toolCalls: [{ function: { name: 'query_notes', arguments: '{"keyword":"项目"}' } }],
        },
        attempts: 0,
        planningMode: 'deterministic',
      });
    const fillSlots = vi.fn().mockResolvedValue({
      applicable: true,
      slotValues: { keyword: '项目' },
      missing: [],
      attempts: 1,
    });
    const plan = vi.fn();

    const result = await runAgentRuntimeV3({
      message: '查找项目笔记',
      compile: vi.fn().mockResolvedValue({ turnSpec: slotSpec, attempts: 1 }),
      route,
      compileWorkflow,
      fillSlots,
      plan,
    });

    expect(result).toMatchObject({ state: 'ready_for_tools', planningMode: 'slot_filler', plannerAttempts: 1 });
    expect(fillSlots).toHaveBeenCalledWith(
      expect.objectContaining({ message: '查找项目笔记', goal: expect.objectContaining({ id: 'read' }), capability }),
    );
    expect(compileWorkflow.mock.calls[1][0].slotValuesByGoal.get('read')).toEqual({ keyword: '项目' });
    expect(plan).not.toHaveBeenCalled();
  });

  it('3.1 只执行无歧义目标，阻断目标保持 clarification', async () => {
    const partialSpec = {
      ...turnSpec,
      version: '3.1',
      requestKind: 'mixed',
      confidence: 'medium',
      goals: [
        { ...turnSpec.goals[0], id: 'safe', ambiguities: [], dependsOn: [] },
        {
          ...turnSpec.goals[0],
          id: 'blocked',
          kind: 'write',
          capabilityId: 'todo.status.set',
          ambiguities: [{ impact: 'blocks_write', question: '要修改哪一条？' }],
          dependsOn: [],
        },
      ],
    };
    const route = vi.fn().mockReturnValue({
      state: 'ready',
      candidates: [{ name: 'read_note' }, { name: 'set_todo_status' }],
      goalRoutes: [
        { goalId: 'safe', status: 'ready', toolNames: ['read_note'] },
        { goalId: 'blocked', status: 'ready', toolNames: ['set_todo_status'] },
      ],
    });
    const plan = vi.fn().mockResolvedValue({
      plan: { version: '2.0' },
      validation: { valid: true, toolCalls: [{ function: { name: 'read_note' } }] },
      attempts: 1,
    });
    const result = await runAgentRuntimeV3({
      message: '读取笔记并修改那个待办',
      compile: vi.fn().mockResolvedValue({ turnSpec: partialSpec, attempts: 1 }),
      route,
      plan,
      compileWorkflow: vi.fn().mockReturnValue({ applicable: false, reason: 'workflow_requires_planner' }),
    });

    expect(result).toMatchObject({
      state: 'ready_for_tools',
      blockedGoalIds: ['blocked'],
      ambiguityQuestions: ['要修改哪一条？'],
      goalStates: [
        { goalId: 'safe', status: 'pending' },
        { goalId: 'blocked', status: 'clarification' },
      ],
    });
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({ completedGoalIds: ['blocked'] }));
  });

  it('按 compile → exact route → context resolve → planner 推进单一状态机', async () => {
    const compile = vi.fn().mockResolvedValue({ turnSpec, attempts: 1 });
    const route = vi.fn().mockReturnValue({
      state: 'ready',
      candidates: [{ name: 'read_note' }],
      goalRoutes: [{ goalId: 'read', status: 'ready', capabilityIds: ['note.read'], toolNames: ['read_note'] }],
    });
    const resolveExecutionContext = vi.fn().mockResolvedValue({ contextRefs: [{ type: 'note', id: 'n1' }] });
    const plan = vi.fn().mockResolvedValue({
      plan: { version: '2.0' },
      validation: { valid: true, toolCalls: [{ function: { name: 'read_note' } }] },
    });
    const result = await runAgentRuntimeV3({
      message: '继续分析刚才那篇',
      compile,
      route,
      plan,
      resolveExecutionContext,
    });
    expect(result).toMatchObject({ runtimeVersion: '3.0', state: 'ready_for_tools', runner: 'answer' });
    expect(result.semanticDigest).toBe('digest-v3');
    expect(result.executionDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(resolveExecutionContext).toHaveBeenCalledWith(
      expect.objectContaining({ turnSpec, route: expect.objectContaining({ state: 'ready' }) }),
    );
    expect(plan).toHaveBeenCalledWith(
      expect.objectContaining({ executionContext: { contextRefs: [{ type: 'note', id: 'n1' }] } }),
    );
  });
});
