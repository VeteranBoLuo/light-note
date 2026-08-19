import { describe, expect, it } from 'vitest';
import { normalizeAiMaterialClarification, normalizeAiResolvedGrounding } from './aiGrounding';

describe('AiResolvedGrounding', () => {
  it('只保留无正文的固定摘要字段和短期 Source Set 锚点', () => {
    expect(
      normalizeAiResolvedGrounding({
        schemaVersion: 2,
        enabled: true,
        mode: 'current_explicit_only',
        historyPolicy: 'discourse_projection_only',
        allowedSourceCount: 3,
        sourcesUsedCount: 2,
        sourceSubsetValid: true,
        sourceSetId: 'd7f5f8f6-4ca0-4d14-8a4d-88c813e3b001',
        materialMode: 'current_explicit',
        allowedRefs: [{ id: 'secret-id' }],
        content: 'OLD_ONLY_FACT',
      }),
    ).toEqual({
      schemaVersion: 2,
      enabled: true,
      mode: 'current_explicit_only',
      historyPolicy: 'discourse_projection_only',
      allowedSourceCount: 3,
      sourcesUsedCount: 2,
      sourceSubsetValid: true,
      sourceSetId: 'd7f5f8f6-4ca0-4d14-8a4d-88c813e3b001',
      materialMode: 'current_explicit',
    });
  });

  it('拒绝未知版本、模式和历史策略', () => {
    expect(normalizeAiResolvedGrounding({ schemaVersion: 1, mode: 'none' })).toBeUndefined();
    expect(
      normalizeAiResolvedGrounding({
        schemaVersion: 2,
        mode: 'all_history',
        historyPolicy: 'legacy_conversation',
      }),
    ).toBeUndefined();
  });

  it('澄清状态只接受短期令牌、固定类型和至少两个公开选项', () => {
    expect(
      normalizeAiMaterialClarification({
        type: 'material_source_set',
        token: 'a'.repeat(43),
        question: '请选择',
        options: [
          { ordinal: 1, label: '最近一组', itemCount: 2 },
          { ordinal: 2, label: '往前第 1 组', itemCount: 1 },
        ],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        sourceSetIds: ['secret'],
      }),
    ).toEqual({
      type: 'material_source_set',
      token: 'a'.repeat(43),
      question: '请选择',
      options: [
        { ordinal: 1, label: '最近一组', itemCount: 2 },
        { ordinal: 2, label: '往前第 1 组', itemCount: 1 },
      ],
      expiresAt: expect.any(String),
    });
    expect(normalizeAiMaterialClarification({ type: 'material_source_set', token: 'short' })).toBeUndefined();
  });
});
