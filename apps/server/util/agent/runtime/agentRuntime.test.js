import { describe, expect, it, vi } from 'vitest';
import { runAgentRuntime } from './agentRuntime.js';

const spec = {
  version: '2.0',
  digest: 'spec-digest',
  requestKind: 'mixed',
  confidence: 'high',
  groundingPolicy: 'workspace_query',
  outputContract: null,
  missingSlots: [],
  clarificationQuestion: '',
  goals: [
    { id: 'read', kind: 'read', capabilityDomain: 'note', dependsOn: [] },
    { id: 'write', kind: 'write', capabilityDomain: 'note', dependsOn: ['read'] },
  ],
};

describe('Agent Runtime V2', () => {
  it('按 compile → route → runner → plan 的唯一状态机推进并保留逐目标状态', async () => {
    const compile = vi.fn().mockResolvedValue({ turnSpec: spec, attempts: 1 });
    const route = vi.fn().mockReturnValue({
      state: 'ready',
      candidates: [{ name: 'query_notes' }],
      goalRoutes: [
        { goalId: 'read', status: 'ready', toolNames: ['query_notes'] },
        { goalId: 'write', status: 'planned', toolNames: [] },
      ],
    });
    const plan = vi.fn().mockResolvedValue({
      plan: { version: '2.0' },
      validation: { valid: true, toolCalls: [{ function: { name: 'query_notes' } }] },
    });
    const result = await runAgentRuntime({ message: '总结并创建笔记', compile, route, plan });
    expect(result).toMatchObject({
      runner: 'mixed',
      state: 'ready_for_tools',
      goalStates: [
        { goalId: 'read', status: 'pending' },
        { goalId: 'write', status: 'planned' },
      ],
    });
    expect(compile).toHaveBeenCalledTimes(1);
    expect(route).toHaveBeenCalledTimes(1);
    expect(plan).toHaveBeenCalledTimes(1);
    expect(plan).toHaveBeenCalledWith(expect.objectContaining({ message: '总结并创建笔记' }));
  });

  it('低置信 TurnSpec 在 Planner 前统一澄清', async () => {
    const compile = vi.fn().mockResolvedValue({
      turnSpec: {
        ...spec,
        confidence: 'low',
        missingSlots: [{ name: 'target', reason: '不明确', question: '处理哪一个？' }],
        clarificationQuestion: '处理哪一个？',
      },
      attempts: 1,
    });
    const route = vi.fn();
    const plan = vi.fn();
    const result = await runAgentRuntime({ message: '处理一下', compile, route, plan });
    expect(result).toMatchObject({ state: 'clarification', question: '处理哪一个？', toolCalls: [] });
    expect(route).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
  });

  it('Planner 缺少真实工具必填参数时统一回到澄清，不猜默认值', async () => {
    const compile = vi.fn().mockResolvedValue({ turnSpec: { ...spec, requestKind: 'action' }, attempts: 1 });
    const route = vi.fn().mockReturnValue({
      state: 'ready',
      candidates: [{ name: 'set_todo_status' }],
      goalRoutes: spec.goals.map((goal) => ({ goalId: goal.id, status: 'ready', toolNames: ['set_todo_status'] })),
    });
    const plan = vi.fn().mockResolvedValue({
      plan: null,
      validation: { valid: false, issues: ['TOOL_ARGUMENT_REQUIRED'], toolCalls: [] },
    });
    const result = await runAgentRuntime({ message: '处理它', compile, route, plan });
    expect(result).toMatchObject({ state: 'clarification', runner: 'clarification', toolCalls: [] });
    expect(result.question).toContain('关键信息');
  });
});
