import { describe, expect, it } from 'vitest';
import { compareTurnSpecWithLegacyPlan, compileTurnSpecShadow, turnSpecTraceSummary } from './turnSpecShadow.js';

describe('TurnSpec shadow', () => {
  it('记录协议失败但不抛出，不影响旧主链', async () => {
    const result = await compileTurnSpecShadow({
      message: '查询今天的笔记',
      request: async () => ({
        toolCalls: [],
        usage: { promptTokens: 2, completionTokens: 1, totalTokens: 3 },
        usageStatus: 'reported',
      }),
    });
    expect(result).toMatchObject({ state: 'invalid', attempts: 3 });
    expect(result.usage.totalTokens).toBe(9);
  });

  it('只输出不含正文和参数的安全分歧摘要', () => {
    const turnSpec = {
      requestKind: 'mixed',
      confidence: 'medium',
      goals: [{ capabilityDomain: 'note' }, { capabilityDomain: 'todo' }],
      missingSlots: [{ name: 'target' }],
    };
    const legacyPlan = {
      requestClass: 'action',
      confidence: 'high',
      intents: [{ capabilityId: 'note.create' }],
      needsClarification: false,
    };
    const divergences = compareTurnSpecWithLegacyPlan(turnSpec, legacyPlan, [{ id: 'note.create', domain: 'note' }]);
    expect(divergences).toEqual(['request_kind', 'confidence', 'capability_domains', 'clarification']);
    expect(turnSpecTraceSummary({ state: 'ready', turnSpec, attempts: 1, durationMs: 9 }, divergences)).toEqual({
      mode: 'shadow',
      state: 'ready',
      requestKind: 'mixed',
      confidence: 'medium',
      goalCount: 2,
      domainCount: 2,
      missingSlotCount: 1,
      attempts: 1,
      durationMs: 9,
      divergenceCodes: divergences,
      errorCode: null,
    });
  });
});
