import { describe, expect, it } from 'vitest';
import { buildReplayProviderResponses, evaluateAgentReplayObservation } from './agentReplayAdapter.js';

describe('AI Agent 回放适配器', () => {
  it('把语义计划步骤转换成供应商工具调用协议', () => {
    const [response] = buildReplayProviderResponses([
      { plan: { requestClass: 'conversation', intents: [], toolCalls: [] } },
    ]);
    expect(response.toolCalls[0].function.name).toBe('submit_agent_plan');
    expect(JSON.parse(response.toolCalls[0].function.arguments)).toMatchObject({
      version: '1.0',
      requestClass: 'conversation',
    });
  });

  it('对确认卡、工具、阶段和内部 ID 泄漏做确定性判定', () => {
    const result = evaluateAgentReplayObservation(
      {
        id: 'case-1',
        expected: {
          providerCalls: 2,
          requiredStages: ['planner', 'final'],
          requiredExecutedTools: ['read_url'],
          confirmations: 0,
          responseIncludes: ['摘要'],
          responseExcludes: ['(ID:'],
          turnContractTrace: {
            requestedScopeMode: 'explicit',
            allowedSourceCount: 2,
            validationIssues: [],
          },
        },
      },
      {
        providerStages: ['planner', 'final'],
        executedTools: ['read_url'],
        confirmations: [],
        response: '合成摘要',
        turnContractTrace: {
          requestedScopeMode: 'explicit',
          allowedSourceCount: 2,
          validationIssues: [],
        },
      },
    );
    expect(result).toMatchObject({ passed: true, errors: [] });
  });
});
