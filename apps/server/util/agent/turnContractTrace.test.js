import { describe, expect, it } from 'vitest';
import {
  createTurnContractTrace,
  recordCandidateSet,
  recordGroundingDecision,
  recordIntentCompiler,
  recordExecutionContract,
  recordExecutionPlanner,
  recordOutputContract,
  recordRuntimeIsolation,
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
    recordRuntimeIsolation(trace, {
      mode: 'v3_enforce',
      configuredMode: 'v3_enforce',
      rolloutReason: 'role_allowlist',
      rolloutPercentage: 5,
      rawHistoryMessageCount: 0,
      recentDialogueMessageCount: 4,
      recentDialogueSource: 'cloud',
      legacyStageCount: 0,
    });
    recordIntentCompiler(trace, {
      mode: 'v3_enforce',
      state: 'ready',
      requestKind: 'answer',
      confidence: 'high',
      continuationMode: 'refer_last_result',
      topicEpochAction: 'keep',
      goalCount: 1,
    });
    recordExecutionPlanner(trace, {
      state: 'blocked',
      attempts: 3,
      issues: ['required_goal_step_missing', 'secret value must not survive'],
    });
    recordExecutionContract(trace, {
      semanticDigest: 'a'.repeat(64),
      executionDigest: 'b'.repeat(64),
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
      runtimeMode: 'v3_enforce',
      runtimeConfiguredMode: 'v3_enforce',
      runtimeRolloutReason: 'role_allowlist',
      runtimeRolloutPercentage: 5,
      rawHistoryMessageCount: 0,
      recentDialogueMessageCount: 4,
      recentDialogueSource: 'cloud',
      legacyStageCount: 0,
      intentCompilerMode: 'v3_enforce',
      intentCompilerState: 'ready',
      turnSpecRequestKind: 'answer',
      turnSpecContinuationMode: 'refer_last_result',
      turnSpecTopicEpochAction: 'keep',
      executionPlannerState: 'blocked',
      executionPlannerAttempts: 3,
      executionPlannerIssues: ['required_goal_step_missing', 'secret_value_must_not_survive'],
      semanticDigest: 'a'.repeat(64),
      executionDigest: 'b'.repeat(64),
    });
    expect(safe.allowedSourceDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(safe.sourcesUsedDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(serialized).not.toContain('secret-note-id');
    expect(serialized).not.toContain('secret-file-id');
    expect(serialized).not.toContain('不应入库');
    expect(serialized).not.toContain('OLD_ONLY_FACT');
  });

  it('V3 trace 模式不会被 legacy 对照覆盖，续答枚举完整保留', () => {
    const trace = createTurnContractTrace();
    recordIntentCompiler(trace, {
      mode: 'v3_shadow',
      state: 'ready',
      continuationMode: 'answer_clarification',
    });
    recordIntentCompiler(trace, {
      mode: 'shadow',
      state: 'ready',
      continuationMode: 'action_continuation',
    });
    expect(trace.intentCompilerMode).toBe('v3_shadow');
    expect(trace.turnSpecContinuationMode).toBe('action_continuation');
    expect(sanitizeTurnContractTrace(trace)).toMatchObject({
      intentCompilerMode: 'v3_shadow',
      turnSpecContinuationMode: 'action_continuation',
    });
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
