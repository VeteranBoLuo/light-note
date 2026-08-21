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
      continuationMode: 'refer_last_result',
      topicEpochAction: 'keep',
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
    expect(divergences).toEqual([
      'request_kind',
      'confidence',
      'capability_ids',
      'capability_domains',
      'clarification',
    ]);
    expect(turnSpecTraceSummary({ state: 'ready', turnSpec, attempts: 1, durationMs: 9 }, divergences)).toEqual({
      mode: 'shadow',
      state: 'ready',
      requestKind: 'mixed',
      confidence: 'medium',
      continuationMode: 'refer_last_result',
      topicEpochAction: 'keep',
      goalCount: 2,
      domainCount: 2,
      missingSlotCount: 1,
      attempts: 1,
      durationMs: 9,
      divergenceCodes: divergences,
      errorCode: null,
    });
  });

  it('legacy 与 V3 两侧都经工具到 Manifest 能力 ID 投影后比较', () => {
    const turnSpec = {
      requestKind: 'answer',
      confidence: 'high',
      goals: [{ capabilityId: 'note.query', capabilityDomain: 'note' }],
      missingSlots: [],
    };
    const legacyPlan = {
      requestClass: 'query',
      confidence: 'high',
      intents: [{ capabilityId: 'read.query_notes' }],
      needsClarification: false,
    };
    const catalog = [{ id: 'read.query_notes', domain: 'note', toolNames: ['query_notes'] }];
    expect(compareTurnSpecWithLegacyPlan(turnSpec, legacyPlan, catalog)).toEqual([]);

    expect(
      compareTurnSpecWithLegacyPlan(
        { ...turnSpec, goals: [{ capabilityId: 'bookmark.query', capabilityDomain: 'bookmark' }] },
        legacyPlan,
        catalog,
      ),
    ).toEqual(expect.arrayContaining(['capability_ids', 'capability_domains']));
  });
});
