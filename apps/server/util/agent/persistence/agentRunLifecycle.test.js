import { describe, expect, it } from 'vitest';
import { deriveAgentRunStatus, mergeAgentRunGoalOutcomes, settleAgentRunGoalStates } from './agentRunLifecycle.js';

describe('Agent Run 目标生命周期', () => {
  it('按服务端 call→goal 绑定记录真实工具终态，失败不会被后续成功覆盖', () => {
    const outcomes = mergeAgentRunGoalOutcomes(
      {},
      [
        { toolCallId: 'call-a', result: { status: 'success' } },
        { toolCallId: 'call-b', result: { status: 'confirmation_required' } },
        { toolCallId: 'call-c', result: { status: 'error' } },
        { toolCallId: 'call-d', result: { status: 'success' } },
      ],
      { 'call-a': 'read', 'call-b': 'write', 'call-c': 'mixed', 'call-d': 'mixed' },
    );
    expect(outcomes).toEqual({ read: 'completed', write: 'awaiting_confirmation', mixed: 'failed' });
  });

  it('保留规划中和不可用目标，并只用真实结果结算其余目标', () => {
    const goalStates = settleAgentRunGoalStates({
      goalStates: [
        { goalId: 'read', status: 'pending' },
        { goalId: 'write', status: 'deferred' },
        { goalId: 'planned', status: 'planned' },
        { goalId: 'unsupported', status: 'unsupported' },
      ],
      goalOutcomes: { read: 'completed', write: 'awaiting_confirmation' },
      turnSpec: {
        goals: [
          { id: 'read', kind: 'read' },
          { id: 'write', kind: 'write' },
          { id: 'planned', kind: 'write' },
          { id: 'unsupported', kind: 'read' },
        ],
      },
      runStatus: 'awaiting_confirmation',
    });
    expect(goalStates).toEqual([
      { goalId: 'read', status: 'completed' },
      { goalId: 'write', status: 'awaiting_confirmation' },
      { goalId: 'planned', status: 'planned' },
      { goalId: 'unsupported', status: 'unsupported' },
    ]);
    expect(deriveAgentRunStatus('awaiting_confirmation', goalStates)).toBe('awaiting_confirmation');
  });

  it('混合成功与失败/不支持时总状态为 partial，全失败与全不支持保持可审计终态', () => {
    expect(
      deriveAgentRunStatus('completed', [
        { goalId: 'one', status: 'completed' },
        { goalId: 'two', status: 'failed' },
      ]),
    ).toBe('partial');
    expect(deriveAgentRunStatus('completed', [{ goalId: 'one', status: 'failed' }])).toBe('failed');
    expect(deriveAgentRunStatus('completed', [{ goalId: 'one', status: 'unsupported' }])).toBe('unsupported');
    expect(deriveAgentRunStatus('completed', [{ goalId: 'one', status: 'planned' }])).toBe('unsupported');
    expect(deriveAgentRunStatus('completed', [{ goalId: 'one', status: 'forbidden' }])).toBe('forbidden');
  });
});
