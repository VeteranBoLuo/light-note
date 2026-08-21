import crypto from 'node:crypto';

const REQUESTED_SCOPE_MODES = new Set(['explicit', 'inherit_candidate', 'workspace', 'none']);
const RESOLVED_SCOPE_MODES = new Set([
  'current_explicit_only',
  'source_set_inherited',
  'legacy_inherited_candidate',
  'workspace_query',
  'general_knowledge',
  'none',
]);
const LENGTH_MODES = new Set(['unspecified', 'minimum', 'target_range', 'relative_growth', 'preserve_length']);
const TRACE_VERSION = '2.0-shadow';
const HISTORY_POLICIES = new Set(['legacy_conversation', 'discourse_projection_only']);
const INTENT_COMPILER_MODES = new Set(['off', 'shadow', 'enforce', 'v3_shadow', 'v3_enforce']);
const INTENT_COMPILER_STATES = new Set(['not_run', 'ready', 'invalid']);
const EXECUTION_PLANNER_STATES = new Set(['not_run', 'ready', 'blocked', 'clarification', 'unsupported']);
const EXECUTION_PLANNING_MODES = new Set(['not_run', 'deterministic', 'slot_filler', 'planner']);
const TURN_REQUEST_KINDS = new Set([
  'unknown',
  'conversation',
  'product_help',
  'answer',
  'action',
  'mixed',
  'create_artifact',
  'revise_artifact',
]);
const CONFIDENCE_LEVELS = new Set(['unknown', 'high', 'medium', 'low']);
const CONTINUATION_MODES = new Set([
  'unknown',
  'independent',
  'refer_last_result',
  'refine_last_artifact',
  'scope_replacement',
  'answer_clarification',
  'action_continuation',
]);
const TOPIC_EPOCH_ACTIONS = new Set(['unknown', 'keep', 'advance']);
const RUNTIME_MODES = new Set(['legacy', 'v3_shadow', 'v3_enforce']);
const RUNTIME_RECENT_DIALOGUE_SOURCES = new Set(['none', 'cloud', 'session']);
const CAPABILITY_POLICY_PROFILES = new Set(['auto', 'chat_only', 'read_only']);
const TURN_SPEC_VERSIONS = new Set(['unknown', '3.0', '3.1']);
const RUNTIME_ROLLOUT_REASONS = new Set([
  'global_legacy',
  'policy_disabled',
  'invalid_policy',
  'excluded',
  'actor_allowlist',
  'role_allowlist',
  'percentage',
  'not_selected',
  'all',
]);

function safeEnum(value, allowed, fallback) {
  const normalized = String(value || '').trim();
  return allowed.has(normalized) ? normalized : fallback;
}

function safeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function safeOptionalCount(value) {
  if (value === null || value === undefined || value === '') return null;
  return safeCount(value);
}

function safeRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Number(number.toFixed(4));
}

function safePercentage(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) return 0;
  return Number(number.toFixed(2));
}

function canonicalRef(value) {
  if (typeof value === 'string') {
    const id = value.trim();
    return id ? `unknown:${id}` : '';
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const type = String(value.type || value.resourceType || value.sourceType || 'unknown').trim();
  const id = String(
    value.id || value.resourceId || value.sourceId || value.documentId || value.attachmentId || '',
  ).trim();
  return id ? `${type || 'unknown'}:${id}` : '';
}

function canonicalRefs(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(canonicalRef).filter(Boolean))].sort();
}

function digestRefs(values) {
  const refs = canonicalRefs(values);
  return {
    count: refs.length,
    digest: refs.length ? crypto.createHash('sha256').update(refs.join('\n')).digest('hex') : null,
  };
}

function safeIssues(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => String(item || '').trim()).filter(Boolean))]
    .map((item) => item.replace(/[^a-z0-9_.-]+/giu, '_').slice(0, 64))
    .filter(Boolean)
    .slice(0, 12);
}

export function createTurnContractTrace() {
  return {
    version: TRACE_VERSION,
    requestedScopeMode: 'none',
    resolvedScopeMode: 'none',
    allowedSourceCount: 0,
    allowedSourceDigest: null,
    sourcesUsedCount: 0,
    sourcesUsedDigest: null,
    lengthMode: 'unspecified',
    requiredMinChars: null,
    previousChars: null,
    actualChars: null,
    growthRatio: null,
    validationIssues: [],
    candidateDomainCount: 0,
    candidateToolCount: 0,
    groundingV2Enabled: false,
    groundingV2ShadowMode: 'none',
    groundingClientModeMismatch: false,
    historyPolicy: 'legacy_conversation',
    sourceSubsetValid: true,
    sourceSubsetViolationCount: 0,
    intentCompilerMode: 'off',
    intentCompilerState: 'not_run',
    turnSpecRequestKind: 'unknown',
    turnSpecVersion: 'unknown',
    turnSpecConfidence: 'unknown',
    turnSpecContinuationMode: 'unknown',
    turnSpecTopicEpochAction: 'unknown',
    turnSpecGoalCount: 0,
    turnSpecDomainCount: 0,
    turnSpecMissingSlotCount: 0,
    intentCompilerAttempts: 0,
    intentCompilerMs: 0,
    intentDivergenceCodes: [],
    intentCompilerErrorCode: null,
    executionPlannerState: 'not_run',
    executionPlanningMode: 'not_run',
    executionPlannerAttempts: 0,
    executionPlannerIssues: [],
    semanticDigest: null,
    executionDigest: null,
    runtimeMode: 'legacy',
    runtimeConfiguredMode: 'legacy',
    runtimeRolloutReason: 'global_legacy',
    runtimeRolloutPercentage: 0,
    rawHistoryMessageCount: 0,
    recentDialogueMessageCount: 0,
    recentDialogueSource: 'none',
    capabilityPolicyProfile: 'auto',
    legacyStageCount: 1,
  };
}

export function resolveRequestedScopeMode({ contextRefs, scopeRefs, attachmentIds, followUpMaterials, scope } = {}) {
  if (
    (Array.isArray(contextRefs) && contextRefs.length) ||
    (Array.isArray(scopeRefs) && scopeRefs.length) ||
    (Array.isArray(attachmentIds) && attachmentIds.length)
  ) {
    return 'explicit';
  }
  if (followUpMaterials && typeof followUpMaterials === 'object' && !Array.isArray(followUpMaterials)) {
    return 'inherit_candidate';
  }
  if (String(scope?.mode || '').trim() === 'workspace') return 'workspace';
  return 'none';
}

export function recordRequestedScope(trace, mode) {
  if (!trace || typeof trace !== 'object') return;
  trace.requestedScopeMode = safeEnum(mode, REQUESTED_SCOPE_MODES, 'none');
}

export function recordResolvedScope(trace, { mode, allowedRefs = [] } = {}) {
  if (!trace || typeof trace !== 'object') return;
  const refs = digestRefs(allowedRefs);
  trace.resolvedScopeMode = safeEnum(mode, RESOLVED_SCOPE_MODES, 'none');
  trace.allowedSourceCount = refs.count;
  trace.allowedSourceDigest = refs.digest;
}

export function recordSourcesUsed(trace, sources = []) {
  if (!trace || typeof trace !== 'object') return;
  const refs = digestRefs(sources);
  trace.sourcesUsedCount = refs.count;
  trace.sourcesUsedDigest = refs.digest;
}

export function recordOutputContract(trace, input = {}) {
  if (!trace || typeof trace !== 'object') return;
  trace.lengthMode = safeEnum(input.lengthMode, LENGTH_MODES, 'unspecified');
  trace.requiredMinChars = safeOptionalCount(input.requiredMinChars);
  trace.previousChars = safeOptionalCount(input.previousChars);
  trace.actualChars = safeOptionalCount(input.actualChars);
  trace.growthRatio = safeRatio(input.growthRatio);
  trace.validationIssues = safeIssues(input.validationIssues);
}

export function recordCandidateSet(trace, { tools = [], capabilityIds = [] } = {}) {
  if (!trace || typeof trace !== 'object') return;
  const toolNames = [
    ...new Set((Array.isArray(tools) ? tools : []).map((item) => String(item || '').trim()).filter(Boolean)),
  ];
  const namespaces = new Set(
    (Array.isArray(capabilityIds) ? capabilityIds : [])
      .map(
        (item) =>
          String(item || '')
            .trim()
            .split('.')[0],
      )
      .filter(Boolean),
  );
  trace.candidateToolCount = toolNames.length;
  trace.candidateDomainCount = namespaces.size;
}

export function recordGroundingDecision(trace, input = {}) {
  if (!trace || typeof trace !== 'object') return;
  trace.groundingV2Enabled = Boolean(input.enabled ?? input.groundingV2Enabled);
  trace.groundingV2ShadowMode = safeEnum(input.shadowMode ?? input.groundingV2ShadowMode, RESOLVED_SCOPE_MODES, 'none');
  trace.groundingClientModeMismatch = Boolean(input.clientModeMismatch ?? input.groundingClientModeMismatch);
  trace.historyPolicy = safeEnum(input.historyPolicy, HISTORY_POLICIES, 'legacy_conversation');
  trace.sourceSubsetValid = (input.subsetValid ?? input.sourceSubsetValid) !== false;
  trace.sourceSubsetViolationCount = safeCount(input.subsetViolationCount ?? input.sourceSubsetViolationCount);
}

export function recordIntentCompiler(trace, input = {}) {
  if (!trace || typeof trace !== 'object') return;
  const nextMode = safeEnum(input.mode, INTENT_COMPILER_MODES, 'off');
  // V3 Runtime 决策是权威隔离边界。后续 legacy shadow/enforce 对照只能补充状态，
  // 不能把已记录的 v3_shadow/v3_enforce 降级成同名 V2 模式。
  trace.intentCompilerMode =
    String(trace.intentCompilerMode || '').startsWith('v3_') && !nextMode.startsWith('v3_')
      ? trace.intentCompilerMode
      : nextMode;
  trace.intentCompilerState = safeEnum(input.state, INTENT_COMPILER_STATES, 'not_run');
  trace.turnSpecRequestKind = safeEnum(input.requestKind, TURN_REQUEST_KINDS, 'unknown');
  trace.turnSpecVersion = safeEnum(input.version, TURN_SPEC_VERSIONS, 'unknown');
  trace.turnSpecConfidence = safeEnum(input.confidence, CONFIDENCE_LEVELS, 'unknown');
  trace.turnSpecContinuationMode = safeEnum(input.continuationMode, CONTINUATION_MODES, 'unknown');
  trace.turnSpecTopicEpochAction = safeEnum(input.topicEpochAction, TOPIC_EPOCH_ACTIONS, 'unknown');
  trace.turnSpecGoalCount = safeCount(input.goalCount);
  trace.turnSpecDomainCount = safeCount(input.domainCount);
  trace.turnSpecMissingSlotCount = safeCount(input.missingSlotCount);
  trace.intentCompilerAttempts = safeCount(input.attempts);
  trace.intentCompilerMs = safeCount(input.durationMs);
  trace.intentDivergenceCodes = safeIssues(input.divergenceCodes);
  trace.intentCompilerErrorCode = input.errorCode ? safeIssues([input.errorCode])[0] || 'intent_compiler_failed' : null;
}

export function recordExecutionPlanner(trace, input = {}) {
  if (!trace || typeof trace !== 'object') return;
  trace.executionPlannerState = safeEnum(input.state, EXECUTION_PLANNER_STATES, 'not_run');
  trace.executionPlanningMode = safeEnum(input.mode, EXECUTION_PLANNING_MODES, 'not_run');
  trace.executionPlannerAttempts = safeCount(input.attempts);
  trace.executionPlannerIssues = safeIssues(input.issues);
}

export function recordExecutionContract(trace, input = {}) {
  if (!trace || typeof trace !== 'object') return;
  trace.semanticDigest = /^[a-f0-9]{64}$/u.test(String(input.semanticDigest || ''))
    ? String(input.semanticDigest)
    : null;
  trace.executionDigest = /^[a-f0-9]{64}$/u.test(String(input.executionDigest || ''))
    ? String(input.executionDigest)
    : null;
}

export function recordRuntimeIsolation(trace, input = {}) {
  if (!trace || typeof trace !== 'object') return;
  const mode = safeEnum(input.mode, RUNTIME_MODES, 'legacy');
  trace.runtimeMode = mode;
  trace.runtimeConfiguredMode = safeEnum(input.configuredMode, RUNTIME_MODES, mode);
  trace.runtimeRolloutReason = safeEnum(
    input.rolloutReason,
    RUNTIME_ROLLOUT_REASONS,
    mode === 'legacy' ? 'global_legacy' : 'all',
  );
  trace.runtimeRolloutPercentage = safePercentage(input.rolloutPercentage);
  trace.rawHistoryMessageCount = safeCount(input.rawHistoryMessageCount);
  trace.recentDialogueMessageCount = safeCount(input.recentDialogueMessageCount);
  trace.recentDialogueSource = safeEnum(input.recentDialogueSource, RUNTIME_RECENT_DIALOGUE_SOURCES, 'none');
  trace.capabilityPolicyProfile = safeEnum(input.capabilityPolicyProfile, CAPABILITY_POLICY_PROFILES, 'auto');
  trace.legacyStageCount = safeCount(input.legacyStageCount ?? (mode === 'v3_enforce' ? 0 : 1));
}

/**
 * 入库前再次构造白名单对象。该对象只包含枚举、数量、哈希和稳定错误码，绝不包含
 * 用户正文、资源标题、真实资源 ID、工具参数或模型回答。
 */
export function sanitizeTurnContractTrace(value) {
  const trace = createTurnContractTrace();
  recordRequestedScope(trace, value?.requestedScopeMode);
  trace.resolvedScopeMode = safeEnum(value?.resolvedScopeMode, RESOLVED_SCOPE_MODES, 'none');
  trace.allowedSourceCount = safeCount(value?.allowedSourceCount);
  trace.allowedSourceDigest = /^[a-f0-9]{64}$/u.test(String(value?.allowedSourceDigest || ''))
    ? String(value.allowedSourceDigest)
    : null;
  trace.sourcesUsedCount = safeCount(value?.sourcesUsedCount);
  trace.sourcesUsedDigest = /^[a-f0-9]{64}$/u.test(String(value?.sourcesUsedDigest || ''))
    ? String(value.sourcesUsedDigest)
    : null;
  recordOutputContract(trace, value);
  trace.candidateDomainCount = safeCount(value?.candidateDomainCount);
  trace.candidateToolCount = safeCount(value?.candidateToolCount);
  recordGroundingDecision(trace, value);
  recordIntentCompiler(trace, {
    mode: value?.intentCompilerMode,
    state: value?.intentCompilerState,
    requestKind: value?.turnSpecRequestKind,
    version: value?.turnSpecVersion,
    confidence: value?.turnSpecConfidence,
    continuationMode: value?.turnSpecContinuationMode,
    topicEpochAction: value?.turnSpecTopicEpochAction,
    goalCount: value?.turnSpecGoalCount,
    domainCount: value?.turnSpecDomainCount,
    missingSlotCount: value?.turnSpecMissingSlotCount,
    attempts: value?.intentCompilerAttempts,
    durationMs: value?.intentCompilerMs,
    divergenceCodes: value?.intentDivergenceCodes,
    errorCode: value?.intentCompilerErrorCode,
  });
  recordExecutionPlanner(trace, {
    state: value?.executionPlannerState,
    mode: value?.executionPlanningMode,
    attempts: value?.executionPlannerAttempts,
    issues: value?.executionPlannerIssues,
  });
  recordExecutionContract(trace, value);
  recordRuntimeIsolation(trace, {
    mode: value?.runtimeMode,
    configuredMode: value?.runtimeConfiguredMode,
    rolloutReason: value?.runtimeRolloutReason,
    rolloutPercentage: value?.runtimeRolloutPercentage,
    rawHistoryMessageCount: value?.rawHistoryMessageCount,
    recentDialogueMessageCount: value?.recentDialogueMessageCount,
    recentDialogueSource: value?.recentDialogueSource,
    capabilityPolicyProfile: value?.capabilityPolicyProfile,
    legacyStageCount: value?.legacyStageCount,
  });
  return trace;
}
