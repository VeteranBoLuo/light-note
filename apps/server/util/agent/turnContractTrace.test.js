import { describe, expect, it } from 'vitest';
import {
  createTurnContractTrace,
  recordCandidateSet,
  recordGroundingDecision,
  recordOutputContract,
  recordRequestedScope,
  recordResolvedScope,
  recordSourcesUsed,
  resolveRequestedScopeMode,
  sanitizeTurnContractTrace,
} from './turnContractTrace.js';

describe('Agent Turn Contract trace', () => {
  it('只记录作用域计数与稳定摘要，不记录资源 ID、标题或正文', () => {
    const trace = createTurnContractTrace();
    recordRequestedScope(trace, 'explicit');
    recordResolvedScope(trace, {
      mode: 'current_explicit_only',
      allowedRefs: [
        { type: 'note', id: 'secret-note-id', title: '不应入库的标题', content: 'OLD_ONLY_FACT' },
        { resourceType: 'file', resourceId: 'secret-file-id', excerpt: '不应入库的正文' },
      ],
    });
    recordSourcesUsed(trace, [{ type: 'note', id: 'secret-note-id' }]);
    recordOutputContract(trace, {
      lengthMode: 'minimum',
      requiredMinChars: 2000,
      previousChars: 800,
      actualChars: 1268,
      growthRatio: 1.585,
      validationIssues: ['length_below_minimum'],
    });
    recordCandidateSet(trace, {
      tools: ['query_notes', 'create_note'],
      capabilityIds: ['read.query_notes', 'note.create'],
    });
    recordGroundingDecision(trace, {
      enabled: true,
      shadowMode: 'current_explicit_only',
      clientModeMismatch: true,
      historyPolicy: 'discourse_projection_only',
      subsetValid: false,
      subsetViolationCount: 1,
    });

    const safe = sanitizeTurnContractTrace(trace);
    const serialized = JSON.stringify(safe);
    expect(safe).toMatchObject({
      version: '2.0-shadow',
      requestedScopeMode: 'explicit',
      resolvedScopeMode: 'current_explicit_only',
      allowedSourceCount: 2,
      sourcesUsedCount: 1,
      lengthMode: 'minimum',
      requiredMinChars: 2000,
      candidateDomainCount: 2,
      candidateToolCount: 2,
      groundingV2Enabled: true,
      groundingV2ShadowMode: 'current_explicit_only',
      groundingClientModeMismatch: true,
      historyPolicy: 'discourse_projection_only',
      sourceSubsetValid: false,
      sourceSubsetViolationCount: 1,
    });
    expect(safe.allowedSourceDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(safe.sourcesUsedDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(serialized).not.toContain('secret-note-id');
    expect(serialized).not.toContain('secret-file-id');
    expect(serialized).not.toContain('不应入库');
    expect(serialized).not.toContain('OLD_ONLY_FACT');
  });

  it('本轮显式材料优先于继承候选，工作区和空范围保持可观察', () => {
    expect(
      resolveRequestedScopeMode({
        contextRefs: [{ type: 'note', id: 'n1' }],
        followUpMaterials: { contextRefs: [{ type: 'note', id: 'old' }] },
      }),
    ).toBe('explicit');
    expect(resolveRequestedScopeMode({ followUpMaterials: { contextRefs: [{ type: 'note', id: 'old' }] } })).toBe(
      'inherit_candidate',
    );
    expect(resolveRequestedScopeMode({ scope: { mode: 'workspace' } })).toBe('workspace');
    expect(resolveRequestedScopeMode({})).toBe('none');
  });
});
