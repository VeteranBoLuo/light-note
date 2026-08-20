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
    expect(resolveExecutionContext).toHaveBeenCalledWith(
      expect.objectContaining({ turnSpec, route: expect.objectContaining({ state: 'ready' }) }),
    );
    expect(plan).toHaveBeenCalledWith(
      expect.objectContaining({ executionContext: { contextRefs: [{ type: 'note', id: 'n1' }] } }),
    );
  });
});
